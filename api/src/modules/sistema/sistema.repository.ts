import { ejecutarProcedimiento } from '../../db/index.js';

export interface FilaEstado {
    BaseDatos: string;
    ScriptsAplicados: number;
    UltimoScript: string | null;
    FechaUltimoScript: Date | null;
    FechaServidor: Date;
}

export async function obtenerEstado(): Promise<FilaEstado | undefined> {
    const { filas } = await ejecutarProcedimiento<FilaEstado>('SP_Sistema_Estado', {}, { reintentable: true });
    return filas[0];
}
