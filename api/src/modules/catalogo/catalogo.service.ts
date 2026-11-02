import { ErrorApi } from '../../errors/ErrorApi.js';
import type { AlmacenImagenes } from '../../storage/almacenImagenes.js';
import * as repositorio from './catalogo.repository.js';

/*
    Lo que la API agrega a las reglas del SP: los archivos de imagen. La subida es en dos pasos
    (primero los archivos, después se asocian sus rutas al producto); al eliminar la imagen del
    producto se borra también su archivo.
*/

/** Resultado de un SP que siempre devuelve el registro: si no llega, el registro no existe. */
export function existente<T>(fila: T | undefined, codigo: string, mensaje: string): T {
    if (fila === undefined) throw new ErrorApi(404, codigo, mensaje);
    return fila;
}

export function crearServicioCatalogo(almacen: AlmacenImagenes) {
    return {
        /** Guarda los archivos (validados y recodificados) y devuelve sus rutas para asociarlas al producto. */
        async subirImagenes(archivos: { buffer: Buffer; originalname: string }[]): Promise<{ rutas: string[] }> {
            if (archivos.length === 0) {
                throw new ErrorApi(400, 'ARCHIVOS_INVALIDOS', 'Envía al menos una imagen en el campo "archivos".');
            }
            const rutas: string[] = [];
            try {
                for (const archivo of archivos) rutas.push(await almacen.guardar(archivo.buffer, archivo.originalname));
            } catch (error) {
                // Todo o nada: si un archivo es inválido no quedan guardados los anteriores.
                await Promise.all(rutas.map((ruta) => almacen.eliminar(ruta)));
                throw error;
            }
            return { rutas };
        },

        /** Elimina la imagen del producto y su archivo; devuelve el producto actualizado. */
        async eliminarImagen(admin: number, idImagen: number) {
            const eliminada = existente(
                await repositorio.eliminarImagen(admin, idImagen),
                'IMAGEN_NO_ENCONTRADA',
                'La imagen no existe.',
            );
            // Después del COMMIT: si el borrado del archivo falla, queda huérfano y lo limpia el proceso horario.
            await almacen.eliminar(eliminada.rutaImagen).catch(() => undefined);
            return existente(
                await repositorio.obtenerProducto(admin, eliminada.idProducto),
                'PRODUCTO_NO_ENCONTRADO',
                'El producto no existe.',
            );
        },
    };
}

export type ServicioCatalogo = ReturnType<typeof crearServicioCatalogo>;
