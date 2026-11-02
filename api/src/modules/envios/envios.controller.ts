import type { Request, Response } from 'express';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import { esquemaEstado } from '../catalogo/catalogo.schemas.js';
import * as repositorio from './envios.repository.js';
import { esquemaActualizarMetodo, esquemaDatosMetodo, esquemaIdDepartamento } from './envios.schemas.js';

/* Catálogos y métodos de envío: sin servicio, no hay reglas que agregar a las del SP. */

function existente<T>(fila: T | undefined): T {
    if (fila === undefined) throw new ErrorApi(404, 'METODO_ENVIO_NO_ENCONTRADO', 'El método de envío no existe.');
    return fila;
}
const admin = (req: Request) => usuarioDe(req).id;
const idDe = (req: Request) => validar(esquemaId, req.params).id;

export async function listarDepartamentos(_req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listarDepartamentos());
}

export async function listarMunicipios(req: Request, res: Response): Promise<void> {
    const { id } = validar(esquemaIdDepartamento, req.params);
    responder(res, await repositorio.listarMunicipios(id));
}

export async function listarMetodosTienda(_req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listarMetodosTienda());
}

export async function listarMetodos(req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listarMetodos(admin(req)));
}

export async function obtenerMetodo(req: Request, res: Response): Promise<void> {
    responder(res, existente(await repositorio.obtenerMetodo(admin(req), idDe(req))));
}

export async function crearMetodo(req: Request, res: Response): Promise<void> {
    responder(res, existente(await repositorio.crearMetodo(admin(req), validar(esquemaDatosMetodo, req.body))), {
        estado: 201,
    });
}

export async function actualizarMetodo(req: Request, res: Response): Promise<void> {
    const { versionFila, ...datos } = validar(esquemaActualizarMetodo, req.body);
    responder(res, existente(await repositorio.actualizarMetodo(admin(req), idDe(req), datos, versionFila)));
}

export async function cambiarEstadoMetodo(req: Request, res: Response): Promise<void> {
    const { activo } = validar(esquemaEstado, req.body);
    responder(res, existente(await repositorio.cambiarEstadoMetodo(admin(req), idDe(req), activo)));
}
