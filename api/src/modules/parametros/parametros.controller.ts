import type { Request, Response } from 'express';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './parametros.repository.js';
import { esquemaActualizarParametro, esquemaClave } from './parametros.schemas.js';

/* Sin servicio: tipo, rango y reglas entre parámetros los valida el SP. */

export async function listar(req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listar(usuarioDe(req).id));
}

export async function obtener(req: Request, res: Response): Promise<void> {
    const { clave } = validar(esquemaClave, req.params);
    responder(res, await repositorio.obtener(usuarioDe(req).id, clave));
}

export async function actualizar(req: Request, res: Response): Promise<void> {
    const { clave } = validar(esquemaClave, req.params);
    const { valor, versionFila } = validar(esquemaActualizarParametro, req.body);
    responder(res, await repositorio.actualizar(usuarioDe(req).id, clave, valor, versionFila));
}
