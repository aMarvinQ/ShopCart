import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';

/*
    Parámetros del sistema (D20, solo administrador). Solo se edita el valor: claves, tipo,
    descripción y rango los carga la semilla. El SP valida tipo, rango (D51) y la relación
    entre los parámetros de sesión (D52); el cambio aplica de inmediato (D55) y queda en la
    bitácora.
*/
type Fila = Record<string, unknown>;

const actor = (idUsuario: number) => ({ IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario } });
const clave = (valor: string) => ({ Clave: { tipo: TipoSql.VarChar(51), valor } });

export async function listar(idUsuario: number): Promise<Fila[]> {
    return (await ejecutarProcedimiento('SP_Configuracion_ListarParametros', actor(idUsuario), { reintentable: true }))
        .filas;
}

export async function obtener(idUsuario: number, c: string): Promise<Fila> {
    const { filas } = await ejecutarProcedimiento(
        'SP_Configuracion_ObtenerParametro',
        { ...actor(idUsuario), ...clave(c) },
        { reintentable: true },
    );
    return filas[0] as Fila;
}

export async function actualizar(idUsuario: number, c: string, valor: string, versionFila: Buffer): Promise<Fila> {
    const { filas } = await ejecutarProcedimiento('SP_Configuracion_ActualizarParametro', {
        ...actor(idUsuario),
        ...clave(c),
        Valor: { tipo: TipoSql.NVarChar(201), valor },
        VersionFila: { tipo: TipoSql.VarBinary(8), valor: versionFila },
    });
    return filas[0] as Fila;
}
