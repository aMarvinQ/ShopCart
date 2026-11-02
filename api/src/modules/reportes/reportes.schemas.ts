import { z } from '../../config/zod.js';
import { esquemaPaginacion } from '../../http/esquemas.js';

/** Día de Guatemala AAAA-MM-DD que existe en el calendario (2026-02-30 no). */
export const esquemaDia = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'formato AAAA-MM-DD')
    .refine((valor) => {
        const fecha = new Date(`${valor}T00:00:00Z`);
        return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor);
    }, 'la fecha no existe')
    .openapi({ type: 'string', format: 'date', example: '2026-10-01' });

const descripcionRango = 'Días de Guatemala, ambos incluidos.';

export const esquemaRango = z.object({
    fechaDesde: esquemaDia.openapi({ description: descripcionRango }),
    fechaHasta: esquemaDia.openapi({ description: descripcionRango }),
});

export const AGRUPACIONES = ['DIA', 'SEMANA', 'MES'] as const;

export const esquemaVentasPeriodo = esquemaRango.extend({
    agrupacion: z.enum(AGRUPACIONES).default('DIA'),
});

export const esquemaCarritosAbandonados = esquemaPaginacion.extend({
    fechaDesde: esquemaDia.optional().openapi({ description: 'Última actividad desde (día de Guatemala).' }),
    fechaHasta: esquemaDia.optional().openapi({ description: 'Última actividad hasta (incluido).' }),
});

export const FORMATOS = ['xlsx', 'pdf'] as const;
const formato = z.enum(FORMATOS).default('xlsx');

export const esquemaExportarVentas = esquemaVentasPeriodo.extend({ formato });
export const esquemaExportarCarritos = esquemaCarritosAbandonados
    .omit({ pagina: true, tamanoPagina: true })
    .extend({ formato });

/* === Respuesta ============================================================================ */

export const esquemaResumen = z
    .object({
        fechaDesde: z.string(),
        fechaHasta: z.string(),
        ventaNeta: z.number().openapi({ description: 'Mercadería: subtotal − descuento − devoluciones, sin envío.' }),
        pedidos: z.number(),
        ticketPromedio: z.number(),
        unidades: z.number(),
        montoDevuelto: z.number(),
        carritosAbandonados: z.number(),
        valorCarritosAbandonados: z.number(),
        variantesExistenciaBaja: z.number().openapi({ description: 'Del momento, no del periodo.' }),
        horasCarritoAbandonado: z.number(),
        existenciaMinima: z.number(),
    })
    .openapi('ResumenVentas');

export const esquemaPeriodo = z
    .object({
        periodo: z.string().openapi({ description: 'Primer día del periodo.' }),
        desde: z.string(),
        hasta: z.string(),
        ventaNeta: z.number(),
        pedidos: z.number(),
    })
    .openapi('VentasPeriodo');

export const esquemaCategoria = z
    .object({
        idCategoria: z.number(),
        categoria: z.string(),
        unidades: z.number(),
        ventaNeta: z.number(),
        porcentaje: z.number(),
    })
    .openapi('VentasCategoria');

export const esquemaTopProducto = z
    .object({
        posicion: z.number(),
        idProducto: z.number(),
        producto: z.string(),
        categoria: z.string(),
        unidades: z.number(),
        ventaNeta: z.number(),
    })
    .openapi('TopProducto');

export const esquemaCarritoAbandonado = z
    .object({
        idCarrito: z.number(),
        esInvitado: z.boolean(),
        cliente: z.string().nullable(),
        correo: z.string().nullable(),
        fechaUltimaActividad: z.string(),
        horasInactivo: z.number(),
        articulos: z.number(),
        valor: z.number(),
        codigoCupon: z.string().nullable(),
    })
    .openapi('CarritoAbandonado');

export type Rango = z.infer<typeof esquemaRango>;
export type FiltrosVentasPeriodo = z.infer<typeof esquemaVentasPeriodo>;
export type FiltrosCarritos = Omit<z.infer<typeof esquemaCarritosAbandonados>, 'pagina' | 'tamanoPagina'>;
