import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar, type DefinicionRuta } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { esquemaId } from '../../http/esquemas.js';
import { recibirImagenes } from '../../middlewares/subidaImagenes.js';
import { AlmacenImagenes } from '../../storage/almacenImagenes.js';
import { crearControladorCatalogo } from './catalogo.controller.js';
import {
    esquemaActualizarCategoria,
    esquemaActualizarImagen,
    esquemaActualizarProducto,
    esquemaActualizarValor,
    esquemaActualizarVariante,
    esquemaAgregarImagenes,
    esquemaAgregarVariantes,
    esquemaAtributo,
    esquemaAtributosCategoria,
    esquemaCambiarPrecio,
    esquemaCategoria,
    esquemaCrearProducto,
    esquemaCrearValor,
    esquemaDatosAtributo,
    esquemaDatosCategoria,
    esquemaEstado,
    esquemaListarProductos,
    esquemaPrecioHistorial,
    esquemaProductoAdmin,
    esquemaProductoListado,
    esquemaRutasSubidas,
    esquemaValor,
} from './catalogo.schemas.js';
import { crearServicioCatalogo } from './catalogo.service.js';

/* Administración del catálogo: solo ADMIN (los SPs también lo validan). Cada cambio queda en la bitácora. */
const ADMIN = ['ADMIN'];
const CONCURRENCIA =
    'Envía la versionFila que devolvió la última lectura: si otro usuario guardó cambios después, responde 409 EDICION_CONCURRENTE.';

function doc(etiqueta: string, definicion: Omit<DefinicionRuta, 'etiqueta' | 'roles'>): void {
    documentar({ ...definicion, etiqueta, roles: ADMIN });
}

/* --- Categorías --- */
const CATEGORIAS = 'Catálogo: categorías';
doc(CATEGORIAS, {
    metodo: 'get',
    ruta: '/categorias',
    resumen: 'Listar categorías',
    respuesta: z.array(esquemaCategoria),
});
doc(CATEGORIAS, {
    metodo: 'get',
    ruta: '/categorias/{id}',
    resumen: 'Ver una categoría (con versionFila y atributos en uso)',
    params: esquemaId,
    respuesta: esquemaCategoria,
    errores: [404],
});
doc(CATEGORIAS, {
    metodo: 'post',
    ruta: '/categorias',
    resumen: 'Crear una categoría',
    cuerpo: esquemaDatosCategoria,
    respuesta: esquemaCategoria,
    estado: 201,
    errores: [400, 409, 422],
});
doc(CATEGORIAS, {
    metodo: 'put',
    ruta: '/categorias/{id}',
    resumen: 'Editar una categoría',
    descripcion: CONCURRENCIA,
    params: esquemaId,
    cuerpo: esquemaActualizarCategoria,
    respuesta: esquemaCategoria,
    errores: [400, 404, 409, 422],
});
doc(CATEGORIAS, {
    metodo: 'patch',
    ruta: '/categorias/{id}/estado',
    resumen: 'Activar o desactivar una categoría',
    descripcion: 'Desactivarla oculta sus productos en la tienda sin cambiar el estado de cada uno.',
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaCategoria,
    errores: [400, 404],
});
doc(CATEGORIAS, {
    metodo: 'put',
    ruta: '/categorias/{id}/atributos',
    resumen: 'Asignar los atributos de una categoría',
    descripcion:
        'Reemplaza la lista completa. No se puede quitar un atributo que usan variantes de la categoría (409 ATRIBUTO_EN_USO).',
    params: esquemaId,
    cuerpo: esquemaAtributosCategoria,
    respuesta: esquemaCategoria,
    errores: [400, 404, 409, 422],
});

/* --- Atributos y valores --- */
const ATRIBUTOS = 'Catálogo: atributos';
doc(ATRIBUTOS, {
    metodo: 'get',
    ruta: '/atributos',
    resumen: 'Listar atributos y sus valores',
    respuesta: z.array(esquemaAtributo),
});
doc(ATRIBUTOS, {
    metodo: 'get',
    ruta: '/atributos/{id}',
    resumen: 'Ver un atributo',
    params: esquemaId,
    respuesta: esquemaAtributo,
    errores: [404],
});
doc(ATRIBUTOS, {
    metodo: 'post',
    ruta: '/atributos',
    resumen: 'Crear un atributo',
    cuerpo: esquemaDatosAtributo,
    respuesta: esquemaAtributo,
    estado: 201,
    errores: [400, 409, 422],
});
doc(ATRIBUTOS, {
    metodo: 'put',
    ruta: '/atributos/{id}',
    resumen: 'Renombrar un atributo',
    params: esquemaId,
    cuerpo: esquemaDatosAtributo,
    respuesta: esquemaAtributo,
    errores: [400, 404, 409, 422],
});
doc(ATRIBUTOS, {
    metodo: 'patch',
    ruta: '/atributos/{id}/estado',
    resumen: 'Activar o desactivar un atributo',
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaAtributo,
    errores: [400, 404],
});
doc(ATRIBUTOS, {
    metodo: 'post',
    ruta: '/atributos/{id}/valores',
    resumen: 'Agregar un valor a un atributo',
    params: esquemaId,
    cuerpo: esquemaCrearValor,
    respuesta: esquemaValor,
    estado: 201,
    errores: [400, 404, 409, 422],
});
doc(ATRIBUTOS, {
    metodo: 'put',
    ruta: '/valores/{id}',
    resumen: 'Editar un valor de atributo',
    params: esquemaId,
    cuerpo: esquemaActualizarValor,
    respuesta: esquemaValor,
    errores: [400, 404, 409, 422],
});
doc(ATRIBUTOS, {
    metodo: 'patch',
    ruta: '/valores/{id}/estado',
    resumen: 'Activar o desactivar un valor',
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaValor,
    errores: [400, 404],
});

/* --- Productos y variantes --- */
const PRODUCTOS = 'Catálogo: productos';
doc(PRODUCTOS, {
    metodo: 'get',
    ruta: '/productos',
    resumen: 'Listar productos (activos e inactivos)',
    query: esquemaListarProductos,
    respuesta: z.array(esquemaProductoListado),
    conMeta: true,
    errores: [400, 422],
});
doc(PRODUCTOS, {
    metodo: 'get',
    ruta: '/productos/{id}',
    resumen: 'Ver un producto con variantes, existencias e imágenes',
    params: esquemaId,
    respuesta: esquemaProductoAdmin,
    errores: [404],
});
doc(PRODUCTOS, {
    metodo: 'post',
    ruta: '/productos',
    resumen: 'Crear un producto con sus variantes e imágenes',
    descripcion:
        'En una sola transacción: el producto, sus variantes (con su existencia inicial en el kardex) y sus imágenes ' +
        '(rutas de POST /imagenes). Nace inactivo: actívalo con PATCH /productos/{id}/estado.',
    cuerpo: esquemaCrearProducto,
    respuesta: esquemaProductoAdmin,
    estado: 201,
    errores: [400, 404, 409, 422],
});
doc(PRODUCTOS, {
    metodo: 'put',
    ruta: '/productos/{id}',
    resumen: 'Editar un producto',
    descripcion: CONCURRENCIA,
    params: esquemaId,
    cuerpo: esquemaActualizarProducto,
    respuesta: esquemaProductoAdmin,
    errores: [400, 404, 409, 422],
});
doc(PRODUCTOS, {
    metodo: 'patch',
    ruta: '/productos/{id}/estado',
    resumen: 'Activar o desactivar un producto',
    descripcion: 'Para activarlo necesita al menos una imagen y una variante activa.',
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaProductoAdmin,
    errores: [400, 404, 409],
});
doc(PRODUCTOS, {
    metodo: 'post',
    ruta: '/productos/{id}/variantes',
    resumen: 'Agregar variantes a un producto',
    params: esquemaId,
    cuerpo: esquemaAgregarVariantes,
    respuesta: esquemaProductoAdmin,
    estado: 201,
    errores: [400, 404, 409, 422],
});
doc(PRODUCTOS, {
    metodo: 'put',
    ruta: '/variantes/{id}',
    resumen: 'Cambiar el SKU de una variante',
    descripcion: CONCURRENCIA,
    params: esquemaId,
    cuerpo: esquemaActualizarVariante,
    respuesta: esquemaProductoAdmin,
    errores: [400, 404, 409, 422],
});
doc(PRODUCTOS, {
    metodo: 'patch',
    ruta: '/variantes/{id}/estado',
    resumen: 'Activar o desactivar una variante',
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaProductoAdmin,
    errores: [400, 404, 409],
});
doc(PRODUCTOS, {
    metodo: 'put',
    ruta: '/variantes/{id}/precio',
    resumen: 'Cambiar el precio de una variante',
    descripcion: `Guarda el historial de precios y la bitácora en la misma transacción. ${CONCURRENCIA}`,
    params: esquemaId,
    cuerpo: esquemaCambiarPrecio,
    respuesta: esquemaProductoAdmin,
    errores: [400, 404, 409, 422],
});
doc(PRODUCTOS, {
    metodo: 'get',
    ruta: '/variantes/{id}/precios',
    resumen: 'Historial de precios de una variante',
    params: esquemaId,
    respuesta: z.array(esquemaPrecioHistorial),
    errores: [404],
});

/* --- Imágenes --- */
const IMAGENES = 'Catálogo: imágenes';
doc(IMAGENES, {
    metodo: 'post',
    ruta: '/imagenes',
    resumen: 'Subir imágenes (paso 1 de 2)',
    descripcion:
        'Hasta 10 archivos de hasta 5 MB en el campo "archivos". Se aceptan JPEG, PNG y WebP reales (se revisa el contenido); ' +
        'se recodifican como WebP de hasta 1600 px sin metadatos. Devuelve las rutas para asociarlas al producto (paso 2). ' +
        'Un archivo que no se asocia a ningún producto se elimina a las 24 horas.',
    cuerpo: z.object({
        archivos: z
            .array(z.string().openapi({ type: 'string', format: 'binary' }))
            .openapi({ description: 'Imágenes.' }),
    }),
    tipoCuerpo: 'multipart',
    respuesta: esquemaRutasSubidas,
    estado: 201,
    errores: [400, 413],
});
doc(IMAGENES, {
    metodo: 'post',
    ruta: '/productos/{id}/imagenes',
    resumen: 'Asociar imágenes a un producto (paso 2 de 2)',
    descripcion:
        'Generales o de un valor de atributo (p. ej. un color que usen sus variantes); una principal por grupo.',
    params: esquemaId,
    cuerpo: esquemaAgregarImagenes,
    respuesta: esquemaProductoAdmin,
    estado: 201,
    errores: [400, 404, 409, 422],
});
doc(IMAGENES, {
    metodo: 'put',
    ruta: '/imagenes/{id}',
    resumen: 'Editar el texto alternativo y el orden de una imagen',
    params: esquemaId,
    cuerpo: esquemaActualizarImagen,
    respuesta: esquemaProductoAdmin,
    errores: [400, 404, 422],
});
doc(IMAGENES, {
    metodo: 'post',
    ruta: '/imagenes/{id}/principal',
    resumen: 'Marcar como imagen principal de su grupo',
    params: esquemaId,
    respuesta: esquemaProductoAdmin,
    errores: [404],
});
doc(IMAGENES, {
    metodo: 'delete',
    ruta: '/imagenes/{id}',
    resumen: 'Eliminar una imagen y su archivo',
    descripcion: 'No se puede eliminar la última imagen de un producto activo (409 PRODUCTO_SIN_IMAGEN).',
    params: esquemaId,
    respuesta: esquemaProductoAdmin,
    errores: [404, 409],
});

export function crearRutasCatalogo({ config, autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const c = crearControladorCatalogo(crearServicioCatalogo(new AlmacenImagenes(config.CARPETA_UPLOADS)));
    const rutas = Router();
    const admin = [autenticar, autorizar('ADMIN')];

    rutas.get('/categorias', ...admin, c.listarCategorias);
    rutas.get('/categorias/:id', ...admin, c.obtenerCategoria);
    rutas.post('/categorias', ...admin, c.crearCategoria);
    rutas.put('/categorias/:id', ...admin, c.actualizarCategoria);
    rutas.patch('/categorias/:id/estado', ...admin, c.cambiarEstadoCategoria);
    rutas.put('/categorias/:id/atributos', ...admin, c.asignarAtributosCategoria);

    rutas.get('/atributos', ...admin, c.listarAtributos);
    rutas.get('/atributos/:id', ...admin, c.obtenerAtributo);
    rutas.post('/atributos', ...admin, c.crearAtributo);
    rutas.put('/atributos/:id', ...admin, c.actualizarAtributo);
    rutas.patch('/atributos/:id/estado', ...admin, c.cambiarEstadoAtributo);
    rutas.post('/atributos/:id/valores', ...admin, c.crearValor);
    rutas.put('/valores/:id', ...admin, c.actualizarValor);
    rutas.patch('/valores/:id/estado', ...admin, c.cambiarEstadoValor);

    rutas.get('/productos', ...admin, c.listarProductos);
    rutas.get('/productos/:id', ...admin, c.obtenerProducto);
    rutas.post('/productos', ...admin, c.crearProducto);
    rutas.put('/productos/:id', ...admin, c.actualizarProducto);
    rutas.patch('/productos/:id/estado', ...admin, c.cambiarEstadoProducto);
    rutas.post('/productos/:id/variantes', ...admin, c.agregarVariantes);
    rutas.put('/variantes/:id', ...admin, c.actualizarVariante);
    rutas.patch('/variantes/:id/estado', ...admin, c.cambiarEstadoVariante);
    rutas.put('/variantes/:id/precio', ...admin, c.cambiarPrecio);
    rutas.get('/variantes/:id/precios', ...admin, c.listarHistorialPrecios);

    // La sesión y el rol se validan ANTES de recibir los archivos: un anónimo no puede subir nada.
    rutas.post('/imagenes', ...admin, recibirImagenes, c.subirImagenes);
    rutas.post('/productos/:id/imagenes', ...admin, c.agregarImagenes);
    rutas.put('/imagenes/:id', ...admin, c.actualizarImagen);
    rutas.post('/imagenes/:id/principal', ...admin, c.establecerImagenPrincipal);
    rutas.delete('/imagenes/:id', ...admin, c.eliminarImagen);
    return rutas;
}
