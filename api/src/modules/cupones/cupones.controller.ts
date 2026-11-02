import type { Request, Response } from 'express';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import { esquemaEstado } from '../catalogo/catalogo.schemas.js';
import * as repositorio from './cupones.repository.js';
import { esquemaActualizarCupon, esquemaDatosCupon, esquemaListarCupones } from './cupones.schemas.js';

/* Sin servicio: no hay reglas que agregar a las del SP. */

function existente<T>(fila: T | undefined): T {
    if (fila === undefined) throw new ErrorApi(404, 'CUPON_NO_ENCONTRADO', 'El cupón no existe.');
    return fila;
}
const admin = (req: Request) => usuarioDe(req).id;
const idDe = (req: Request) => validar(esquemaId, req.params).id;

export async function listar(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaListarCupones, req.query);
    const { filas, total } = await repositorio.listar(admin(req), filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function obtener(req: Request, res: Response): Promise<void> {
    responder(res, existente(await repositorio.obtener(admin(req), idDe(req))));
}

export async function crear(req: Request, res: Response): Promise<void> {
    responder(res, existente(await repositorio.crear(admin(req), validar(esquemaDatosCupon, req.body))), {
        estado: 201,
    });
}

export async function actualizar(req: Request, res: Response): Promise<void> {
    const { versionFila, ...datos } = validar(esquemaActualizarCupon, req.body);
    responder(res, existente(await repositorio.actualizar(admin(req), idDe(req), datos, versionFila)));
}

export async function cambiarEstado(req: Request, res: Response): Promise<void> {
    const { activo } = validar(esquemaEstado, req.body);
    responder(res, existente(await repositorio.cambiarEstado(admin(req), idDe(req), activo)));
}
