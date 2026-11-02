import type { Request, Response } from 'express';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import {
    esquemaActualizarPerfil,
    esquemaCambiarEstado,
    esquemaCrearInterno,
    esquemaListarUsuarios,
} from './usuarios.schemas.js';
import * as servicio from './usuarios.service.js';

export async function obtenerPerfil(req: Request, res: Response): Promise<void> {
    responder(res, await servicio.obtenerPerfil(usuarioDe(req).id));
}

export async function actualizarPerfil(req: Request, res: Response): Promise<void> {
    responder(res, await servicio.actualizarPerfil(usuarioDe(req).id, validar(esquemaActualizarPerfil, req.body)));
}

export async function listar(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaListarUsuarios, req.query);
    const { filas, total } = await servicio.listar(usuarioDe(req).id, filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function crearInterno(req: Request, res: Response): Promise<void> {
    responder(res, await servicio.crearInterno(usuarioDe(req).id, validar(esquemaCrearInterno, req.body)), {
        estado: 201,
    });
}

export async function cambiarEstado(req: Request, res: Response): Promise<void> {
    const { id } = validar(esquemaId, req.params);
    const { activo } = validar(esquemaCambiarEstado, req.body);
    responder(res, await servicio.cambiarEstado(usuarioDe(req).id, id, activo));
}
