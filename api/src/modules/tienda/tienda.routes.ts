import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import * as controlador from './tienda.controller.js';
import {
    esquemaBuscar,
    esquemaCategoriaTienda,
    esquemaProductoTienda,
    esquemaSlugProducto,
    esquemaTarjeta,
} from './tienda.schemas.js';

/* Tienda pública (sin sesión): solo productos visibles (activos, de categoría activa y con variantes en venta). */
const ETIQUETA = 'Tienda';

documentar({
    metodo: 'get',
    ruta: '/tienda/categorias',
    etiqueta: ETIQUETA,
    resumen: 'Categorías con productos visibles',
    respuesta: z.array(esquemaCategoriaTienda),
});
documentar({
    metodo: 'get',
    ruta: '/tienda/productos',
    etiqueta: ETIQUETA,
    resumen: 'Buscar productos',
    descripcion:
        'Cada tarjeta muestra el precio y la imagen de la variante de selección inicial (la primera disponible). ' +
        'Búsqueda sin distinguir mayúsculas ni tildes; % y _ se buscan como texto.',
    query: esquemaBuscar,
    respuesta: z.array(esquemaTarjeta),
    conMeta: true,
    errores: [400, 404, 422],
});
documentar({
    metodo: 'get',
    ruta: '/tienda/productos/{slug}',
    etiqueta: ETIQUETA,
    resumen: 'Detalle de un producto',
    descripcion:
        'Variantes en venta en su orden (la de selección inicial primero, las agotadas al final), con sus atributos para ' +
        'armar los selectores, e imágenes generales y por valor de atributo.',
    params: esquemaSlugProducto,
    respuesta: esquemaProductoTienda,
    errores: [400, 404],
});

export function crearRutasTienda(): Router {
    const rutas = Router();
    rutas.get('/tienda/categorias', controlador.listarCategorias);
    rutas.get('/tienda/productos', controlador.buscar);
    rutas.get('/tienda/productos/:slug', controlador.obtenerProducto);
    return rutas;
}
