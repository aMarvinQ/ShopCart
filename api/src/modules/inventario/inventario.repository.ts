import type { z } from '../../config/zod.js';
import { ejecutarProcedimiento, parametrosOrden, tablaSql, TipoSql } from '../../db/index.js';
import type { esquemaExistencias, esquemaKardex, esquemaMovimiento } from './inventario.schemas.js';

/* Inventario (OPERADOR y ADMIN): la existencia cambia solo junto con su kardex, dentro del SP. */

const actor = (idUsuario: number) => ({ IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario } });

export async function listarExistencias(idUsuario: number, f: z.infer<typeof esquemaExistencias>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Inventario_ListarExistencias',
        {
            ...actor(idUsuario),
            Busqueda: { tipo: TipoSql.NVarChar(101), valor: f.busqueda || null },
            IDCategoria: { tipo: TipoSql.Int, valor: f.idCategoria ?? null },
            SoloAgotadas: { tipo: TipoSql.Bit, valor: f.soloAgotadas ?? false },
            Pagina: { tipo: TipoSql.Int, valor: f.pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: f.tamanoPagina },
            ...parametrosOrden(f),
            SoloExistenciaBaja: { tipo: TipoSql.Bit, valor: f.soloExistenciaBaja ?? false },
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export async function listarKardex(idUsuario: number, f: z.infer<typeof esquemaKardex>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Inventario_ListarKardex',
        {
            ...actor(idUsuario),
            IDVariante: { tipo: TipoSql.Int, valor: f.idVariante ?? null },
            CodigoTipo: { tipo: TipoSql.VarChar(31), valor: f.tipo ?? null },
            FechaDesde: { tipo: TipoSql.DateTime2(3), valor: f.fechaDesde ?? null },
            FechaHasta: { tipo: TipoSql.DateTime2(3), valor: f.fechaHasta ?? null },
            Pagina: { tipo: TipoSql.Int, valor: f.pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: f.tamanoPagina },
            ...parametrosOrden(f),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export async function registrarMovimiento(idUsuario: number, m: z.infer<typeof esquemaMovimiento>) {
    const lineas = tablaSql(
        'dbo.TT_Inventario_Movimiento',
        [
            { nombre: 'IDVariante', tipo: TipoSql.Int },
            { nombre: 'Cantidad', tipo: TipoSql.Int },
        ],
        m.lineas.map((l) => [l.idVariante, l.cantidad]),
    );
    const { filas } = await ejecutarProcedimiento('SP_Inventario_RegistrarMovimiento', {
        ...actor(idUsuario),
        CodigoTipo: { tipo: TipoSql.VarChar(31), valor: m.tipo },
        Motivo: { tipo: TipoSql.NVarChar(301), valor: m.motivo || null },
        Lineas: { tipo: TipoSql.TVP, valor: lineas },
    });
    return filas;
}

export async function conciliar(idUsuario: number) {
    return (await ejecutarProcedimiento('SP_Inventario_Conciliar', actor(idUsuario), { reintentable: true })).filas;
}
