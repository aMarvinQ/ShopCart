import type { Logger } from 'pino';
import { filtrarImagenesEnUso } from '../modules/catalogo/catalogo.repository.js';
import type { AlmacenImagenes } from '../storage/almacenImagenes.js';

/*
    Borra los archivos subidos que nunca se asociaron a un producto (subida en dos pasos). Solo
    toca archivos con más de 24 horas: uno recién subido puede estar esperando a que el
    administrador guarde el producto. Se consulta a la base en lotes de 1000 rutas.
*/
const ANTIGUEDAD_MS = 24 * 60 * 60 * 1000;
const LOTE = 1000;

export async function limpiarImagenesHuerfanas(almacen: AlmacenImagenes, ahora = new Date()): Promise<string[]> {
    const candidatas = await almacen.listarAnterioresA(new Date(ahora.getTime() - ANTIGUEDAD_MS));
    const eliminadas: string[] = [];
    for (let i = 0; i < candidatas.length; i += LOTE) {
        const lote = candidatas.slice(i, i + LOTE);
        const enUso = await filtrarImagenesEnUso(lote);
        for (const ruta of lote.filter((r) => !enUso.has(r))) {
            await almacen.eliminar(ruta);
            eliminadas.push(ruta);
        }
    }
    return eliminadas;
}

/** Ejecuta la limpieza cada hora (no impide que el proceso termine). */
export function programarLimpiezaImagenes(almacen: AlmacenImagenes, logger: Logger): NodeJS.Timeout {
    const ejecutar = () => {
        limpiarImagenesHuerfanas(almacen).then(
            (eliminadas) => {
                if (eliminadas.length > 0)
                    logger.info({ eliminadas: eliminadas.length }, 'Imágenes huérfanas eliminadas');
            },
            (error: unknown) => {
                logger.error({ err: error }, 'Falló la limpieza de imágenes huérfanas');
            },
        );
    };
    return setInterval(ejecutar, 60 * 60 * 1000).unref();
}
