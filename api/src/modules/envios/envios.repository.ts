import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';

export async function listarDepartamentos(): Promise<Record<string, unknown>[]> {
    return (await ejecutarProcedimiento('SP_Envios_ListarDepartamentos', {}, { reintentable: true })).filas;
}

export async function listarMunicipios(idDepartamento: number): Promise<Record<string, unknown>[]> {
    const { filas } = await ejecutarProcedimiento(
        'SP_Envios_ListarMunicipios',
        { IDDepartamento: { tipo: TipoSql.TinyInt, valor: idDepartamento } },
        { reintentable: true },
    );
    return filas;
}
