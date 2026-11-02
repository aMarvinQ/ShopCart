import { ejecutarProcedimiento } from '../../db/index.js';

export interface FilaEstado {
    baseDatos: string;
    scriptsAplicados: number;
    ultimoScript: string | null;
    fechaUltimoScript: Date | null;
    fechaServidor: Date;
}

export async function obtenerEstado(): Promise<FilaEstado | undefined> {
    const { filas } = await ejecutarProcedimiento<FilaEstado>('SP_Sistema_Estado', {}, { reintentable: true });
    return filas[0];
}
