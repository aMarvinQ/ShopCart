import { z } from '../../config/zod.js';
import { booleanoQuery, esquemaOrden, esquemaPaginacion } from '../../http/esquemas.js';

const TIPOS_MANUALES = ['ENTRADA_COMPRA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA'] as const;
const TIPOS = [...TIPOS_MANUALES, 'INVENTARIO_INICIAL', 'SALIDA_VENTA', 'CANCELACION', 'DEVOLUCION'] as const;

export const esquemaExistencias = esquemaPaginacion.extend({
    ...esquemaOrden(['PRODUCTO', 'SKU', 'CATEGORIA', 'FISICA', 'RESERVADO', 'DISPONIBLE'], 'PRODUCTO', 'ASC'),
    busqueda: z.string().trim().max(100).optional().openapi({ description: 'SKU o nombre del producto (contiene).' }),
    idCategoria: z.coerce.number().int().positive().optional(),
    soloAgotadas: booleanoQuery.optional(),
    soloExistenciaBaja: booleanoQuery
        .optional()
        .openapi({ description: 'Variantes en venta con disponible igual o menor que EXISTENCIA_MINIMA.' }),
});

export const esquemaKardex = esquemaPaginacion.extend({
    ...esquemaOrden(['FECHA', 'PRODUCTO', 'CANTIDAD'], 'FECHA', 'DESC'),
    tamanoPagina: z.coerce.number().int().min(1).max(100).default(50),
    idVariante: z.coerce.number().int().positive().optional(),
    tipo: z.enum(TIPOS).optional(),
    fechaDesde: z.coerce.date().optional().openapi({ description: 'Desde (incluida), fecha y hora UTC.' }),
    fechaHasta: z.coerce.date().optional().openapi({ description: 'Hasta (excluida), fecha y hora UTC.' }),
});

export const esquemaMovimiento = z.object({
    tipo: z.enum(TIPOS_MANUALES).openapi({
        description: 'Solo los manuales; ventas, cancelaciones y devoluciones los registran sus procesos.',
    }),
    motivo: z
        .string()
        .trim()
        .max(300)
        .optional()
        .openapi({ example: 'Conteo físico: dos unidades dañadas.', description: 'Obligatorio en los ajustes.' }),
    lineas: z
        .array(z.object({ idVariante: z.number().int().positive(), cantidad: z.number().int().min(1).max(100_000) }))
        .min(1)
        .max(200)
        .refine((lineas) => new Set(lineas.map((l) => l.idVariante)).size === lineas.length, 'una variante por línea'),
});

export const esquemaExistencia = z
    .object({
        idVariante: z.number(),
        sku: z.string(),
        idProducto: z.number(),
        producto: z.string(),
        descripcion: z.string().openapi({ description: 'Valores de la variante (p. ej. "Negro / M").' }),
        categoria: z.string(),
        existenciaFisica: z.number(),
        reservado: z.number().openapi({ description: 'Apartado por checkouts en curso.' }),
        disponible: z.number(),
        activo: z.boolean(),
        productoActivo: z.boolean(),
    })
    .openapi('Existencia');

export const esquemaMovimientoKardex = z
    .object({
        idMovimientoInventario: z.string().openapi({ description: 'BIGINT: llega como texto.' }),
        fecha: z.string(),
        idVariante: z.number(),
        sku: z.string(),
        producto: z.string(),
        codigoTipo: z.string(),
        tipo: z.string(),
        cantidad: z.number(),
        saldoAnterior: z.number(),
        saldoNuevo: z.number(),
        motivo: z.string().nullable(),
        idPedido: z.number().nullable(),
        idDevolucion: z.number().nullable(),
        idUsuario: z.number(),
        usuario: z.string(),
    })
    .openapi('MovimientoKardex');

export const esquemaMovimientoRegistrado = z
    .object({
        idMovimientoInventario: z.string(),
        idVariante: z.number(),
        sku: z.string(),
        producto: z.string(),
        codigoTipo: z.string(),
        cantidad: z.number(),
        saldoAnterior: z.number(),
        saldoNuevo: z.number(),
        disponible: z.number(),
    })
    .openapi('MovimientoRegistrado');

export const esquemaConciliacion = z
    .object({
        idVariante: z.number(),
        sku: z.string(),
        producto: z.string(),
        existenciaFisica: z.number(),
        sumaKardex: z.number(),
        ultimoSaldo: z.number(),
        movimientos: z.number(),
        saltos: z.number(),
        diferencia: z.number(),
    })
    .openapi('Conciliacion');
