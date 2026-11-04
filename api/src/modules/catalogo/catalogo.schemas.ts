import { z } from '../../config/zod.js';
import {
    booleanoQuery,
    esquemaMonto,
    esquemaOrden,
    esquemaPaginacion,
    esquemaSlug,
    esquemaVersion,
} from '../../http/esquemas.js';

/* Entrada: los límites coinciden con los de las columnas; las reglas de negocio las valida el SP. */

const id = z.number().int().positive();
const textoOpcional = (maximo: number) =>
    z
        .string()
        .trim()
        .max(maximo)
        .transform((valor) => valor || null)
        .nullable()
        .optional();

export const esquemaEstado = z.object({ activo: z.boolean() });

/* --- Categorías --------------------------------------------------------------------------- */
export const esquemaDatosCategoria = z.object({
    nombre: z.string().trim().min(1).max(100).openapi({ example: 'Accesorios' }),
    slug: esquemaSlug.max(120).openapi({ example: 'accesorios' }),
    descripcion: textoOpcional(500),
});
export const esquemaActualizarCategoria = esquemaDatosCategoria.extend({ versionFila: esquemaVersion });
export const esquemaAtributosCategoria = z.object({
    atributos: z
        .array(z.object({ idAtributo: id, orden: z.number().int().min(0).max(255) }))
        .max(20)
        .openapi({
            description: 'Atributos de la categoría en el orden de sus selectores. Lista vacía = sin atributos.',
        }),
});

/* --- Atributos y valores ------------------------------------------------------------------ */
export const esquemaDatosAtributo = z.object({
    nombre: z.string().trim().min(1).max(50).openapi({ example: 'Material' }),
});
const codigoHex = z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'formato #RRGGBB')
    .nullable()
    .optional()
    .openapi({ example: '#1F4E9C', description: 'Color para el selector (solo atributos de color).' });
export const esquemaCrearValor = z.object({
    valor: z.string().trim().min(1).max(50).openapi({ example: 'Algodón' }),
    codigoHex,
    orden: z.number().int().min(0).max(255).optional().openapi({ description: 'Si se omite, va al final.' }),
});
export const esquemaActualizarValor = esquemaCrearValor.extend({ orden: z.number().int().min(0).max(255) });

/* --- Productos ---------------------------------------------------------------------------- */
export const esquemaListarProductos = esquemaPaginacion.extend({
    ...esquemaOrden(['MODIFICACION', 'NOMBRE', 'CATEGORIA', 'PRECIO', 'EXISTENCIA'], 'MODIFICACION', 'DESC'),
    idCategoria: z.coerce.number().int().positive().optional(),
    activo: booleanoQuery.optional(),
    busqueda: z.string().trim().max(100).optional().openapi({ description: 'Nombre o SKU (contiene).' }),
});

const esquemaVarianteNueva = z.object({
    sku: z.string().trim().min(3).max(50).openapi({ example: 'MOC-NEG-M' }),
    precio: esquemaMonto,
    existenciaInicial: z.number().int().min(0).max(1_000_000).default(0),
    atributos: z
        .array(z.object({ idAtributo: id, idAtributoValor: id }))
        .max(10)
        .default([])
        .openapi({ description: 'Un valor por atributo de la categoría (p. ej. Color y Talla).' }),
});

const esquemaImagenNueva = z.object({
    ruta: z
        .string()
        .max(500)
        .startsWith('/uploads/productos/')
        .openapi({ example: '/uploads/productos/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.webp' }),
    textoAlternativo: z.string().trim().min(1).max(200).openapi({ example: 'Mochila negra, vista frontal' }),
    idAtributoValor: id
        .nullable()
        .optional()
        .openapi({ description: 'Valor (p. ej. un color) al que pertenece; vacío = general.' }),
    orden: z.number().int().min(0).max(255).default(0),
    esPrincipal: z.boolean().default(false),
});

export const esquemaCrearProducto = z.object({
    idCategoria: id,
    nombre: z.string().trim().min(1).max(200).openapi({ example: 'Mochila urbana' }),
    slug: esquemaSlug,
    descripcion: textoOpcional(4000),
    variantes: z.array(esquemaVarianteNueva).min(1).max(100),
    imagenes: z.array(esquemaImagenNueva).max(50).default([]).openapi({
        description: 'Rutas devueltas por POST /imagenes. Se necesita al menos una para activar el producto.',
    }),
});
export const esquemaActualizarProducto = esquemaCrearProducto
    .pick({ idCategoria: true, nombre: true, slug: true, descripcion: true })
    .extend({ versionFila: esquemaVersion });
export const esquemaAgregarVariantes = z.object({ variantes: z.array(esquemaVarianteNueva).min(1).max(100) });
export const esquemaAgregarImagenes = z.object({ imagenes: z.array(esquemaImagenNueva).min(1).max(50) });

export const esquemaActualizarVariante = z.object({
    sku: z.string().trim().min(3).max(50),
    versionFila: esquemaVersion,
});
export const esquemaCambiarPrecio = z.object({ precio: esquemaMonto, versionFila: esquemaVersion });
export const esquemaActualizarImagen = z.object({
    textoAlternativo: z.string().trim().min(1).max(200),
    orden: z.number().int().min(0).max(255),
});

export type VarianteNueva = z.infer<typeof esquemaVarianteNueva>;
export type ImagenNueva = z.infer<typeof esquemaImagenNueva>;

/* --- Respuestas (documentación) ----------------------------------------------------------- */
const fecha = z.string().openapi({ format: 'date-time' });
const version = z.string().openapi({ description: 'Enviar en la siguiente edición (control de edición concurrente).' });

export const esquemaCategoria = z
    .object({
        idCategoria: z.number(),
        nombre: z.string(),
        slug: z.string(),
        descripcion: z.string().nullable(),
        activo: z.boolean(),
        fechaCreacion: fecha,
        fechaModificacion: fecha.nullable(),
        versionFila: version.optional(),
        productosTotales: z.number(),
        productosActivos: z.number(),
        atributos: z.array(
            z.object({
                idAtributo: z.number(),
                nombre: z.string(),
                orden: z.number(),
                activo: z.boolean(),
                enUso: z.boolean().optional(),
            }),
        ),
    })
    .openapi('Categoria');

export const esquemaAtributo = z
    .object({
        idAtributo: z.number(),
        nombre: z.string(),
        activo: z.boolean(),
        fechaCreacion: fecha,
        categoriasAsignadas: z.number().optional(),
        valores: z.array(
            z.object({
                idAtributoValor: z.number(),
                valor: z.string(),
                orden: z.number(),
                codigoHex: z.string().nullable(),
                activo: z.boolean(),
                enUso: z.boolean().optional(),
            }),
        ),
    })
    .openapi('Atributo');

export const esquemaValor = z
    .object({
        idAtributoValor: z.number(),
        idAtributo: z.number(),
        valor: z.string(),
        orden: z.number(),
        codigoHex: z.string().nullable(),
        activo: z.boolean(),
    })
    .openapi('AtributoValor');

export const esquemaProductoAdmin = z
    .object({
        idProducto: z.number(),
        idCategoria: z.number(),
        categoria: z.string(),
        categoriaActiva: z.boolean(),
        nombre: z.string(),
        slug: z.string(),
        descripcion: z.string().nullable(),
        activo: z.boolean(),
        fechaCreacion: fecha,
        fechaModificacion: fecha.nullable(),
        versionFila: version,
        variantes: z.array(
            z.object({
                idVariante: z.number(),
                sku: z.string(),
                precio: z.number(),
                activo: z.boolean(),
                existenciaFisica: z.number(),
                disponible: z.number(),
                esSeleccionInicial: z.boolean(),
                versionFila: version,
                atributos: z.array(
                    z.object({
                        idAtributo: z.number(),
                        atributo: z.string(),
                        idAtributoValor: z.number(),
                        valor: z.string(),
                        codigoHex: z.string().nullable(),
                    }),
                ),
            }),
        ),
        imagenes: z.array(
            z.object({
                idProductoImagen: z.number(),
                idAtributoValor: z.number().nullable(),
                valor: z.string().nullable(),
                rutaImagen: z.string(),
                textoAlternativo: z.string(),
                orden: z.number(),
                esPrincipal: z.boolean(),
            }),
        ),
    })
    .openapi('ProductoAdmin');

export const esquemaProductoListado = z
    .object({
        idProducto: z.number(),
        nombre: z.string(),
        slug: z.string(),
        idCategoria: z.number(),
        categoria: z.string(),
        activo: z.boolean(),
        categoriaActiva: z.boolean(),
        variantesTotales: z.number(),
        variantesActivas: z.number(),
        precioMinimo: z.number().nullable(),
        precioMaximo: z.number().nullable(),
        existenciaTotal: z.number(),
        imagenPrincipal: z.string().nullable(),
    })
    .openapi('ProductoListado');

export const esquemaPrecioHistorial = z
    .object({
        idHistorialPrecio: z.number(),
        fecha,
        precioAnterior: z.number().nullable(),
        precioNuevo: z.number(),
        idUsuario: z.number(),
        usuario: z.string(),
    })
    .openapi('PrecioHistorial');

export const esquemaRutasSubidas = z.object({
    rutas: z.array(z.string()).openapi({ example: ['/uploads/productos/1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed.webp'] }),
});
