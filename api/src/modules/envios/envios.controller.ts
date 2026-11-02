import type { Request, Response } from 'express';
import { responder, validar } from '../../http/respuesta.js';
import * as repositorio from './envios.repository.js';
import { esquemaIdDepartamento } from './envios.schemas.js';

/* Catálogos de solo lectura: sin servicio, no hay reglas que agregar a las del SP. */

export async function listarDepartamentos(_req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listarDepartamentos());
}

export async function listarMunicipios(req: Request, res: Response): Promise<void> {
    const { id } = validar(esquemaIdDepartamento, req.params);
    responder(res, await repositorio.listarMunicipios(id));
}
