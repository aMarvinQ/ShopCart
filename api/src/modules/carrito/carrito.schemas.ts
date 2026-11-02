import { z } from '../../config/zod.js';

export const esquemaAgregarItem = z.object({
    idVariante: z.number().int().positive().openapi({ example: 1 }),
    cantidad: z.number().int().min(1).max(999).default(1),
});

export const esquemaCantidad = z.object({ cantidad: z.number().int().min(1).max(999) });

export const esquemaIdVariante = z.object({
    idVariante: z.coerce
        .number()
        .int()
        .positive()
        .openapi({ param: { name: 'idVariante', in: 'path' }, example: 1 }),
});

export const esquemaCodigoCupon = z.object({
    codigo: z.string().trim().min(3).max(30).openapi({ example: 'BIENVENIDA10' }),
});

export const esquemaCarrito = z
    .object({
        idCarrito: z.number().nullable().openapi({ description: 'null si aún no hay carrito.' }),
        maximoPorLinea: z.number(),
        cantidadArticulos: z.number(),
        subtotal: z.number(),
        descuento: z.number(),
        total: z.number().openapi({ description: 'Sin envío: el costo de envío se suma en el checkout.' }),
        puedeComprar: z
            .boolean()
            .openapi({ description: 'Hay líneas, todas DISPONIBLE y el cupón (si hay) es aplicable.' }),
        cupon: z
            .object({
                codigo: z.string(),
                descripcion: z.string(),
                tipoDescuento: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
                valor: z.number(),
                montoMinimo: z.number(),
                idCategoria: z.number().nullable(),
                aplicable: z.boolean(),
                codigoError: z
                    .string()
                    .nullable()
                    .openapi({ description: 'Por qué no aplica, p. ej. CUPON_MONTO_MINIMO.' }),
                montoFaltante: z.number().nullable(),
            })
            .nullable(),
        items: z.array(
            z.object({
                idCarritoItem: z.number(),
                idVariante: z.number(),
                sku: z.string(),
                idProducto: z.number(),
                producto: z.string(),
                slug: z.string(),
                descripcion: z.string().openapi({ description: 'Valores de la variante (p. ej. "Negro / M").' }),
                imagen: z.string().nullable(),
                textoAlternativo: z.string().nullable(),
                precioUnitario: z.number().openapi({ description: 'Precio vigente.' }),
                cantidad: z.number(),
                importe: z.number(),
                disponible: z.number(),
                cantidadMaxima: z
                    .number()
                    .openapi({ description: 'Tope: el menor entre el límite por línea y lo disponible.' }),
                estado: z.enum(['DISPONIBLE', 'AGOTADO', 'CANTIDAD_EXCEDIDA', 'NO_DISPONIBLE']),
            }),
        ),
    })
    .openapi('Carrito');
