import type { Request, Response } from 'express';
import { responder } from '../../http/respuesta.js';
import * as servicio from './sistema.service.js';

export async function salud(_req: Request, res: Response): Promise<void> {
    responder(res, await servicio.obtenerEstado());
}
