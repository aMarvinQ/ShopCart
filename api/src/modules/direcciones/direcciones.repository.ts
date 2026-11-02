import { ejecutarProcedimiento, TipoSql, type Parametro } from '../../db/index.js';
import type { DatosDireccion } from './direcciones.schemas.js';

/* Cada SP valida que la dirección sea del cliente (una ajena responde como inexistente) y devuelve la libreta completa. */

export type FilaDireccion = Record<string, unknown>;

const cliente = (idUsuario: number) => ({ IDUsuario: { tipo: TipoSql.Int, valor: idUsuario } });

function datos(d: DatosDireccion): Record<string, Parametro> {
    return {
        Alias: { tipo: TipoSql.NVarChar(51), valor: d.alias },
        NombreDestinatario: { tipo: TipoSql.NVarChar(151), valor: d.nombreDestinatario },
        Telefono: { tipo: TipoSql.NVarChar(21), valor: d.telefono },
        Linea1: { tipo: TipoSql.NVarChar(201), valor: d.linea1 },
        Linea2: { tipo: TipoSql.NVarChar(201), valor: d.linea2 ?? null },
        IDMunicipio: { tipo: TipoSql.SmallInt, valor: d.idMunicipio },
        CodigoPostal: { tipo: TipoSql.NVarChar(6), valor: d.codigoPostal ?? null },
        Referencias: { tipo: TipoSql.NVarChar(301), valor: d.referencias ?? null },
    };
}

export async function listar(idUsuario: number): Promise<FilaDireccion[]> {
    return (await ejecutarProcedimiento('SP_Direcciones_Listar', cliente(idUsuario), { reintentable: true })).filas;
}

export async function crear(
    idUsuario: number,
    d: DatosDireccion,
    esPredeterminada: boolean,
): Promise<{ idDireccion: number; direcciones: FilaDireccion[] }> {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Direcciones_Crear',
        { ...cliente(idUsuario), ...datos(d), EsPredeterminada: { tipo: TipoSql.Bit, valor: esPredeterminada } },
        { salidas: { IDDireccion: TipoSql.Int } },
    );
    return { idDireccion: Number(salidas.IDDireccion), direcciones: filas };
}

export async function actualizar(idUsuario: number, idDireccion: number, d: DatosDireccion): Promise<FilaDireccion[]> {
    return (
        await ejecutarProcedimiento('SP_Direcciones_Actualizar', {
            ...cliente(idUsuario),
            IDDireccion: { tipo: TipoSql.Int, valor: idDireccion },
            ...datos(d),
        })
    ).filas;
}

export async function marcarPredeterminada(idUsuario: number, idDireccion: number): Promise<FilaDireccion[]> {
    return (
        await ejecutarProcedimiento('SP_Direcciones_MarcarPredeterminada', {
            ...cliente(idUsuario),
            IDDireccion: { tipo: TipoSql.Int, valor: idDireccion },
        })
    ).filas;
}

export async function eliminar(idUsuario: number, idDireccion: number): Promise<FilaDireccion[]> {
    return (
        await ejecutarProcedimiento('SP_Direcciones_Eliminar', {
            ...cliente(idUsuario),
            IDDireccion: { tipo: TipoSql.Int, valor: idDireccion },
        })
    ).filas;
}
