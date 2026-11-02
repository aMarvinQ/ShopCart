import type { Request, Response } from 'express';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './catalogo.repository.js';
import {
    esquemaActualizarCategoria,
    esquemaActualizarImagen,
    esquemaActualizarProducto,
    esquemaActualizarValor,
    esquemaActualizarVariante,
    esquemaAgregarImagenes,
    esquemaAgregarVariantes,
    esquemaAtributosCategoria,
    esquemaCambiarPrecio,
    esquemaCrearProducto,
    esquemaCrearValor,
    esquemaDatosAtributo,
    esquemaDatosCategoria,
    esquemaEstado,
    esquemaListarProductos,
} from './catalogo.schemas.js';
import { existente, type ServicioCatalogo } from './catalogo.service.js';

/*
    Administración del catálogo (ADMIN). Cada operación devuelve el registro actualizado (con su
    versionFila nueva), como lo devuelve el SP.
*/
const admin = (req: Request) => usuarioDe(req).id;
const idDe = (req: Request) => validar(esquemaId, req.params).id;

const categoria = <T>(fila: T | undefined) => existente(fila, 'CATEGORIA_NO_ENCONTRADA', 'La categoría no existe.');
const atributo = <T>(fila: T | undefined) => existente(fila, 'ATRIBUTO_NO_ENCONTRADO', 'El atributo no existe.');
const producto = <T>(fila: T | undefined) => existente(fila, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe.');
const valor = <T>(fila: T | undefined) => existente(fila, 'VALOR_NO_ENCONTRADO', 'El valor de atributo no existe.');

export function crearControladorCatalogo(servicio: ServicioCatalogo) {
    return {
        /* --- Categorías --- */
        listarCategorias: async (req: Request, res: Response) => {
            responder(res, await repositorio.listarCategorias(admin(req)));
        },
        obtenerCategoria: async (req: Request, res: Response) => {
            responder(res, categoria(await repositorio.obtenerCategoria(admin(req), idDe(req))));
        },
        crearCategoria: async (req: Request, res: Response) => {
            const datos = validar(esquemaDatosCategoria, req.body);
            responder(res, categoria(await repositorio.crearCategoria(admin(req), datos)), { estado: 201 });
        },
        actualizarCategoria: async (req: Request, res: Response) => {
            const { versionFila, ...datos } = validar(esquemaActualizarCategoria, req.body);
            responder(res, categoria(await repositorio.actualizarCategoria(admin(req), idDe(req), datos, versionFila)));
        },
        cambiarEstadoCategoria: async (req: Request, res: Response) => {
            const { activo } = validar(esquemaEstado, req.body);
            responder(res, categoria(await repositorio.cambiarEstadoCategoria(admin(req), idDe(req), activo)));
        },
        asignarAtributosCategoria: async (req: Request, res: Response) => {
            const { atributos } = validar(esquemaAtributosCategoria, req.body);
            responder(res, categoria(await repositorio.asignarAtributosCategoria(admin(req), idDe(req), atributos)));
        },

        /* --- Atributos y valores --- */
        listarAtributos: async (req: Request, res: Response) => {
            responder(res, await repositorio.listarAtributos(admin(req)));
        },
        obtenerAtributo: async (req: Request, res: Response) => {
            responder(res, atributo(await repositorio.obtenerAtributo(admin(req), idDe(req))));
        },
        crearAtributo: async (req: Request, res: Response) => {
            const { nombre } = validar(esquemaDatosAtributo, req.body);
            responder(res, atributo(await repositorio.crearAtributo(admin(req), nombre)), { estado: 201 });
        },
        actualizarAtributo: async (req: Request, res: Response) => {
            const { nombre } = validar(esquemaDatosAtributo, req.body);
            responder(res, atributo(await repositorio.actualizarAtributo(admin(req), idDe(req), nombre)));
        },
        cambiarEstadoAtributo: async (req: Request, res: Response) => {
            const { activo } = validar(esquemaEstado, req.body);
            responder(res, atributo(await repositorio.cambiarEstadoAtributo(admin(req), idDe(req), activo)));
        },
        crearValor: async (req: Request, res: Response) => {
            const datos = validar(esquemaCrearValor, req.body);
            responder(res, valor(await repositorio.crearValor(admin(req), idDe(req), datos)), { estado: 201 });
        },
        actualizarValor: async (req: Request, res: Response) => {
            const datos = validar(esquemaActualizarValor, req.body);
            responder(res, valor(await repositorio.actualizarValor(admin(req), idDe(req), datos)));
        },
        cambiarEstadoValor: async (req: Request, res: Response) => {
            const { activo } = validar(esquemaEstado, req.body);
            responder(res, valor(await repositorio.cambiarEstadoValor(admin(req), idDe(req), activo)));
        },

        /* --- Productos y variantes --- */
        listarProductos: async (req: Request, res: Response) => {
            const filtros = validar(esquemaListarProductos, req.query);
            const { filas, total } = await repositorio.listarProductos(admin(req), filtros);
            responder(res, filas, {
                meta: { pagina: filtros.pagina, tamanoPagina: filtros.tamanoPagina, totalRegistros: total },
            });
        },
        obtenerProducto: async (req: Request, res: Response) => {
            responder(res, producto(await repositorio.obtenerProducto(admin(req), idDe(req))));
        },
        crearProducto: async (req: Request, res: Response) => {
            const { variantes, imagenes, ...datos } = validar(esquemaCrearProducto, req.body);
            responder(res, producto(await repositorio.crearProducto(admin(req), datos, variantes, imagenes)), {
                estado: 201,
            });
        },
        actualizarProducto: async (req: Request, res: Response) => {
            const { versionFila, ...datos } = validar(esquemaActualizarProducto, req.body);
            responder(res, producto(await repositorio.actualizarProducto(admin(req), idDe(req), datos, versionFila)));
        },
        cambiarEstadoProducto: async (req: Request, res: Response) => {
            const { activo } = validar(esquemaEstado, req.body);
            responder(res, producto(await repositorio.cambiarEstadoProducto(admin(req), idDe(req), activo)));
        },
        agregarVariantes: async (req: Request, res: Response) => {
            const { variantes } = validar(esquemaAgregarVariantes, req.body);
            responder(res, producto(await repositorio.agregarVariantes(admin(req), idDe(req), variantes)), {
                estado: 201,
            });
        },
        actualizarVariante: async (req: Request, res: Response) => {
            const { sku, versionFila } = validar(esquemaActualizarVariante, req.body);
            responder(res, producto(await repositorio.actualizarVariante(admin(req), idDe(req), sku, versionFila)));
        },
        cambiarEstadoVariante: async (req: Request, res: Response) => {
            const { activo } = validar(esquemaEstado, req.body);
            responder(res, producto(await repositorio.cambiarEstadoVariante(admin(req), idDe(req), activo)));
        },
        cambiarPrecio: async (req: Request, res: Response) => {
            const { precio, versionFila } = validar(esquemaCambiarPrecio, req.body);
            responder(res, producto(await repositorio.cambiarPrecio(admin(req), idDe(req), precio, versionFila)));
        },
        listarHistorialPrecios: async (req: Request, res: Response) => {
            responder(res, await repositorio.listarHistorialPrecios(admin(req), idDe(req)));
        },

        /* --- Imágenes --- */
        subirImagenes: async (req: Request, res: Response) => {
            const archivos = Array.isArray(req.files) ? req.files : [];
            responder(res, await servicio.subirImagenes(archivos), { estado: 201 });
        },
        agregarImagenes: async (req: Request, res: Response) => {
            const { imagenes } = validar(esquemaAgregarImagenes, req.body);
            responder(res, producto(await repositorio.agregarImagenes(admin(req), idDe(req), imagenes)), {
                estado: 201,
            });
        },
        actualizarImagen: async (req: Request, res: Response) => {
            const { textoAlternativo, orden } = validar(esquemaActualizarImagen, req.body);
            responder(
                res,
                producto(await repositorio.actualizarImagen(admin(req), idDe(req), textoAlternativo, orden)),
            );
        },
        establecerImagenPrincipal: async (req: Request, res: Response) => {
            responder(res, producto(await repositorio.establecerImagenPrincipal(admin(req), idDe(req))));
        },
        eliminarImagen: async (req: Request, res: Response) => {
            responder(res, await servicio.eliminarImagen(admin(req), idDe(req)));
        },
    };
}
