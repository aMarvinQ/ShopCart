import { z } from '../../config/zod.js';
import { booleanoQuery, esquemaMonto, esquemaPaginacion, esquemaSlug } from '../../http/esquemas.js';

export const esquemaBuscar = esquemaPaginacion.extend({
    texto: z.string().trim().max(100).optional().openapi({ description: 'Busca en nombre y descripción.' }),
    categoria: esquemaSlug.optional().openapi({ description: 'Slug de la categoría.', example: 'ropa' }),
    precioMinimo: esquemaMonto.optional(),
    precioMaximo: esquemaMonto.optional(),
    soloDisponibles: booleanoQuery.optional(),
    ordenarPor: z.enum(['RECIENTES', 'NOMBRE', 'PRECIO']).default('RECIENTES'),
    direccion: z.enum(['ASC', 'DESC']).default('DESC'),
});

export const esquemaSlugProducto = z.object({
    slug: esquemaSlug.openapi({ param: { name: 'slug', in: 'path' } }),
});

export const esquemaCategoriaTienda = z
    .object({
        idCategoria: z.number(),
        nombre: z.string(),
        slug: z.string(),
        descripcion: z.string().nullable(),
        productosVisibles: z.number(),
    })
    .openapi('CategoriaTienda');

export const esquemaTarjeta = z
    .object({
        idProducto: z.number(),
        nombre: z.string(),
        slug: z.string(),
        categoria: z.string(),
        slugCategoria: z.string(),
        precio: z.number().openapi({ description: 'Precio de la variante de selección inicial.' }),
        disponible: z.boolean(),
        imagenPrincipal: z.string().nullable(),
        textoAlternativo: z.string().nullable(),
    })
    .openapi('ProductoTarjeta');

const esquemaAtributoVariante = z.object({
    idAtributo: z.number(),
    atributo: z.string(),
    ordenAtributo: z.number(),
    idAtributoValor: z.number(),
    valor: z.string(),
    ordenValor: z.number(),
    codigoHex: z.string().nullable(),
});

export const esquemaProductoTienda = z
    .object({
        idProducto: z.number(),
        nombre: z.string(),
        slug: z.string(),
        descripcion: z.string().nullable(),
        idCategoria: z.number(),
        categoria: z.string(),
        slugCategoria: z.string(),
        variantes: z.array(
            z.object({
                idVariante: z.number(),
                sku: z.string(),
                precio: z.number(),
                disponible: z.number(),
                esSeleccionInicial: z.boolean(),
                atributos: z.array(esquemaAtributoVariante),
            }),
        ),
        imagenes: z.array(
            z.object({
                idAtributoValor: z.number().nullable(),
                rutaImagen: z.string(),
                textoAlternativo: z.string(),
                orden: z.number(),
                esPrincipal: z.boolean(),
            }),
        ),
    })
    .openapi('ProductoTienda');
