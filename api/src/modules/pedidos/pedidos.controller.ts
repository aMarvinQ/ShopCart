import type { Request, Response } from 'express';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './pedidos.repository.js';
import {
    esquemaCambiarEstado,
    esquemaCancelarCliente,
    esquemaCancelarPanel,
    esquemaListarDevoluciones,
    esquemaListarPedidos,
    esquemaMisPedidos,
    esquemaRegistrarDevolucion,
} from './pedidos.schemas.js';
import * as servicio from './pedidos.service.js';

/* El usuario sale del token; los SPs validan rol, pertenencia y transiciones. */
const idUsuario = (req: Request) => usuarioDe(req).id;
const idDe = (req: Request) => validar(esquemaId, req.params).id;

/* --- Cliente ------------------------------------------------------------------------------ */

export async function misPedidos(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaMisPedidos, req.query);
    const { filas, total } = await repositorio.listarCliente(idUsuario(req), filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function miPedido(req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.obtenerCliente(idUsuario(req), idDe(req)));
}

export async function cancelarMiPedido(req: Request, res: Response): Promise<void> {
    const { motivo } = validar(esquemaCancelarCliente, req.body ?? {});
    responder(res, await repositorio.cancelar(idUsuario(req), idDe(req), motivo));
}

/* --- Seguimiento (sin sesión) --------------------------------------------------------------- */

export async function seguimiento(req: Request, res: Response): Promise<void> {
    const pedido = await servicio.seguimiento(req.params);
    // El enlace es una credencial: que no quede en cachés compartidas.
    res.setHeader('Cache-Control', 'no-store');
    responder(res, pedido);
}

/* --- Panel ---------------------------------------------------------------------------------- */

export async function listar(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaListarPedidos, req.query);
    const { filas, total } = await repositorio.listar(idUsuario(req), filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function obtener(req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.obtener(idUsuario(req), idDe(req)));
}

export async function cambiarEstado(req: Request, res: Response): Promise<void> {
    const { estado, comentario } = validar(esquemaCambiarEstado, req.body);
    responder(res, await repositorio.cambiarEstado(idUsuario(req), idDe(req), estado, comentario));
}

export async function cancelar(req: Request, res: Response): Promise<void> {
    const { motivo } = validar(esquemaCancelarPanel, req.body);
    responder(res, await repositorio.cancelar(idUsuario(req), idDe(req), motivo));
}

export async function registrarDevolucion(req: Request, res: Response): Promise<void> {
    const devolucion = validar(esquemaRegistrarDevolucion, req.body);
    responder(res, await repositorio.registrarDevolucion(idUsuario(req), idDe(req), devolucion), { estado: 201 });
}

export async function listarDevoluciones(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaListarDevoluciones, req.query);
    const { filas, total } = await repositorio.listarDevoluciones(idUsuario(req), filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}
