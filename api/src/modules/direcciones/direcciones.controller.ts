import type { Request, Response } from 'express';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './direcciones.repository.js';
import { esquemaCrearDireccion, esquemaDatosDireccion } from './direcciones.schemas.js';

/*
    Libreta de direcciones del cliente. Sin capa de servicio propia: no hay reglas que agregar a
    las del SP (máximo 5, una predeterminada, direcciones ajenas como inexistentes).
*/

export async function listar(req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listar(usuarioDe(req).id));
}

export async function crear(req: Request, res: Response): Promise<void> {
    const { esPredeterminada, ...datos } = validar(esquemaCrearDireccion, req.body);
    responder(res, await repositorio.crear(usuarioDe(req).id, datos, esPredeterminada), { estado: 201 });
}

export async function actualizar(req: Request, res: Response): Promise<void> {
    const { id } = validar(esquemaId, req.params);
    responder(res, await repositorio.actualizar(usuarioDe(req).id, id, validar(esquemaDatosDireccion, req.body)));
}

export async function marcarPredeterminada(req: Request, res: Response): Promise<void> {
    const { id } = validar(esquemaId, req.params);
    responder(res, await repositorio.marcarPredeterminada(usuarioDe(req).id, id));
}

export async function eliminar(req: Request, res: Response): Promise<void> {
    const { id } = validar(esquemaId, req.params);
    responder(res, await repositorio.eliminar(usuarioDe(req).id, id));
}
