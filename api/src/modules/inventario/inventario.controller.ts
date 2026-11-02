import type { Request, Response } from 'express';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './inventario.repository.js';
import { esquemaExistencias, esquemaKardex, esquemaMovimiento } from './inventario.schemas.js';

/* Sin servicio: las reglas (tipos manuales, motivo, disponibilidad, kardex) las aplica el SP. */

export async function listarExistencias(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaExistencias, req.query);
    const { filas, total } = await repositorio.listarExistencias(usuarioDe(req).id, filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function listarKardex(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaKardex, req.query);
    const { filas, total } = await repositorio.listarKardex(usuarioDe(req).id, filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function registrarMovimiento(req: Request, res: Response): Promise<void> {
    const movimiento = validar(esquemaMovimiento, req.body);
    responder(res, await repositorio.registrarMovimiento(usuarioDe(req).id, movimiento), { estado: 201 });
}

export async function conciliar(req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.conciliar(usuarioDe(req).id));
}
