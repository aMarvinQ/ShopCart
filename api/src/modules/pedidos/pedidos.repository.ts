import type { z } from '../../config/zod.js';
import { ejecutarProcedimiento, tablaSql, TipoSql } from '../../db/index.js';
import type {
    esquemaListarDevoluciones,
    esquemaListarPedidos,
    esquemaMisPedidos,
    esquemaRegistrarDevolucion,
} from './pedidos.schemas.js';

/*
    Pedidos: consultas del cliente, del invitado (enlace de seguimiento) y del panel, cambios de
    estado, cancelación y devoluciones. Cada SP valida el rol y las transiciones; el historial de
    estados y la bitácora los escriben la base.
*/
type Fila = Record<string, unknown>;

/** Columnas FOR JSON del detalle de un pedido (FU_Pedidos_Detalle). */
export const JSON_PEDIDO = { json: ['lineas', 'historial', 'pagos', 'devoluciones'] };

const entero = (valor: number) => ({ tipo: TipoSql.Int, valor });
const actor = (idUsuario: number) => ({ IDUsuarioAccion: entero(idUsuario) });

/** Primera fila del SP: los SPs de un pedido lanzan PEDIDO_NO_ENCONTRADO si no existe. */
async function pedido(promesa: ReturnType<typeof ejecutarProcedimiento>): Promise<Fila> {
    return (await promesa).filas[0] as Fila;
}

/* --- Cliente ------------------------------------------------------------------------------ */

export async function listarCliente(idUsuario: number, f: z.infer<typeof esquemaMisPedidos>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Pedidos_ListarCliente',
        { IDUsuario: entero(idUsuario), Pagina: entero(f.pagina), TamanoPagina: entero(f.tamanoPagina) },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export const obtenerCliente = (idUsuario: number, idPedido: number) =>
    pedido(
        ejecutarProcedimiento(
            'SP_Pedidos_ObtenerCliente',
            { IDUsuario: entero(idUsuario), IDPedido: entero(idPedido) },
            { ...JSON_PEDIDO, reintentable: true },
        ),
    );

/** Seguimiento sin sesión: el SHA-256 del token del enlace. */
export const obtenerSeguimiento = (tokenHash: Buffer) =>
    pedido(
        ejecutarProcedimiento(
            'SP_Pedidos_ObtenerSeguimiento',
            { TokenSeguimientoHash: { tipo: TipoSql.VarBinary(64), valor: tokenHash } },
            { ...JSON_PEDIDO, reintentable: true },
        ),
    );

/* --- Panel (operador y administrador) ------------------------------------------------------ */

export async function listar(idUsuario: number, f: z.infer<typeof esquemaListarPedidos>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Pedidos_Listar',
        {
            ...actor(idUsuario),
            CodigoEstado: { tipo: TipoSql.VarChar(21), valor: f.estado ?? null },
            FechaDesde: { tipo: TipoSql.DateTime2(3), valor: f.fechaDesde ?? null },
            FechaHasta: { tipo: TipoSql.DateTime2(3), valor: f.fechaHasta ?? null },
            Busqueda: { tipo: TipoSql.NVarChar(101), valor: f.busqueda || null },
            Pagina: entero(f.pagina),
            TamanoPagina: entero(f.tamanoPagina),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export const obtener = (idUsuario: number, idPedido: number) =>
    pedido(
        ejecutarProcedimiento(
            'SP_Pedidos_Obtener',
            { ...actor(idUsuario), IDPedido: entero(idPedido) },
            { ...JSON_PEDIDO, reintentable: true },
        ),
    );

/** Pedir el estado actual no es error (doble clic): se puede reintentar ante un deadlock. */
export const cambiarEstado = (idUsuario: number, idPedido: number, estado: string, comentario: string | undefined) =>
    pedido(
        ejecutarProcedimiento(
            'SP_Pedidos_CambiarEstado',
            {
                ...actor(idUsuario),
                IDPedido: entero(idPedido),
                CodigoEstado: { tipo: TipoSql.VarChar(21), valor: estado },
                Comentario: { tipo: TipoSql.NVarChar(501), valor: comentario || null },
            },
            { ...JSON_PEDIDO, reintentable: true },
        ),
    );

/** El SP responde con la vista del cliente o la del panel según el rol de quien cancela. */
export const cancelar = (idUsuario: number, idPedido: number, motivo: string | undefined) =>
    pedido(
        ejecutarProcedimiento(
            'SP_Pedidos_Cancelar',
            {
                ...actor(idUsuario),
                IDPedido: entero(idPedido),
                Motivo: { tipo: TipoSql.NVarChar(501), valor: motivo || null },
            },
            JSON_PEDIDO,
        ),
    );

/* --- Devoluciones -------------------------------------------------------------------------- */

export function registrarDevolucion(
    idUsuario: number,
    idPedido: number,
    { motivo, lineas }: z.infer<typeof esquemaRegistrarDevolucion>,
) {
    const tabla = tablaSql(
        'dbo.TT_Devoluciones_Linea',
        [
            { nombre: 'IDPedidoDetalle', tipo: TipoSql.Int },
            { nombre: 'Cantidad', tipo: TipoSql.Int },
            { nombre: 'Reingresa', tipo: TipoSql.Bit },
        ],
        lineas.map((l) => [l.idPedidoDetalle, l.cantidad, l.reingresa]),
    );
    return pedido(
        ejecutarProcedimiento(
            'SP_Devoluciones_Registrar',
            {
                ...actor(idUsuario),
                IDPedido: entero(idPedido),
                Motivo: { tipo: TipoSql.NVarChar(501), valor: motivo },
                Lineas: { tipo: TipoSql.TVP, valor: tabla },
            },
            JSON_PEDIDO,
        ),
    );
}

export async function listarDevoluciones(idUsuario: number, f: z.infer<typeof esquemaListarDevoluciones>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Devoluciones_Listar',
        {
            ...actor(idUsuario),
            FechaDesde: { tipo: TipoSql.DateTime2(3), valor: f.fechaDesde ?? null },
            FechaHasta: { tipo: TipoSql.DateTime2(3), valor: f.fechaHasta ?? null },
            Pagina: entero(f.pagina),
            TamanoPagina: entero(f.tamanoPagina),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}
