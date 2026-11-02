import { ErrorApi } from '../../errors/ErrorApi.js';
import * as repositorio from './sistema.repository.js';

export interface EstadoSistema {
    estado: 'ok';
    baseDatos: { scriptsAplicados: number; ultimoScript: string | null; fechaUltimoScript: Date | null };
    fechaServidor: Date;
}

/** La API está sana si la base responde (con el usuario de la API) y tiene su esquema. */
export async function obtenerEstado(): Promise<EstadoSistema> {
    const fila = await repositorio.obtenerEstado();
    if (!fila) throw new ErrorApi(503, 'BASE_DATOS_NO_DISPONIBLE', 'La base de datos no respondió.');
    return {
        estado: 'ok',
        baseDatos: {
            scriptsAplicados: fila.ScriptsAplicados,
            ultimoScript: fila.UltimoScript,
            fechaUltimoScript: fila.FechaUltimoScript,
        },
        fechaServidor: fila.FechaServidor,
    };
}
