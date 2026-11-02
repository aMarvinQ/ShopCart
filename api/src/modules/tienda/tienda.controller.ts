import type { Request, Response } from 'express';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { responder, validar } from '../../http/respuesta.js';
import * as repositorio from './tienda.repository.js';
import { esquemaBuscar, esquemaSlugProducto } from './tienda.schemas.js';

/* Lecturas públicas: sin servicio, la visibilidad y el precio mostrado los resuelve el SP. */

export async function listarCategorias(_req: Request, res: Response): Promise<void> {
    responder(res, await repositorio.listarCategorias());
}

export async function buscar(req: Request, res: Response): Promise<void> {
    const filtros = validar(esquemaBuscar, req.query);
    const { filas, total } = await repositorio.buscar(filtros);
    responder(res, filas, {
        meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
    });
}

export async function obtenerProducto(req: Request, res: Response): Promise<void> {
    const { slug } = validar(esquemaSlugProducto, req.params);
    const producto = await repositorio.obtenerProducto(slug);
    if (!producto) throw new ErrorApi(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe o no está disponible.');
    responder(res, producto);
}
