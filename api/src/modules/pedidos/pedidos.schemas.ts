import { z } from '../../config/zod.js';
import { esquemaOrden, esquemaPaginacion } from '../../http/esquemas.js';

export const ESTADOS_PEDIDO = [
    'PAGADO',
    'EN_PREPARACION',
    'ENVIADO',
    'ENTREGADO',
    'CANCELADO',
    'DEVUELTO_PARCIAL',
    'DEVUELTO',
] as const;

/* === Entrada ============================================================================== */

const fecha = (descripcion: string) =>
    z.coerce.date().optional().openapi({ type: 'string', format: 'date-time', description: descripcion });

export const esquemaListarPedidos = esquemaPaginacion.extend({
    ...esquemaOrden(['FECHA', 'NUMERO', 'CLIENTE', 'TOTAL', 'ESTADO'], 'FECHA', 'DESC'),
    estado: z.enum(ESTADOS_PEDIDO).optional(),
    fechaDesde: fecha('Desde (incluida), fecha y hora UTC.'),
    fechaHasta: fecha('Hasta (excluida), fecha y hora UTC.'),
    busqueda: z
        .string()
        .trim()
        .max(100)
        .optional()
        .openapi({ description: 'Número de pedido, correo o nombre del contacto (contiene).' }),
});

export const esquemaMisPedidos = esquemaPaginacion.extend({
    ...esquemaOrden(['FECHA', 'TOTAL'], 'FECHA', 'DESC'),
    tamanoPagina: z.coerce.number().int().min(1).max(100).default(10),
});

export const esquemaListarDevoluciones = esquemaPaginacion.extend({
    ...esquemaOrden(['FECHA', 'PEDIDO', 'MONTO'], 'FECHA', 'DESC'),
    fechaDesde: fecha('Desde (incluida), fecha y hora UTC.'),
    fechaHasta: fecha('Hasta (excluida), fecha y hora UTC.'),
});

export const esquemaCambiarEstado = z.object({
    estado: z.enum(['EN_PREPARACION', 'ENVIADO', 'ENTREGADO']).openapi({
        description:
            'Avance operativo: PAGADO → EN_PREPARACION → ENVIADO → ENTREGADO. Pedir el estado actual no es error. ' +
            'La cancelación y las devoluciones tienen su propio endpoint.',
    }),
    comentario: z.string().trim().max(500).optional().openapi({ example: 'Guía 123456 de la transportista.' }),
});

export const esquemaCancelarCliente = z.object({
    motivo: z.string().trim().max(500).optional().openapi({ example: 'Me equivoqué de talla.' }),
});

export const esquemaCancelarPanel = z.object({
    motivo: z.string().trim().min(1).max(500).openapi({ example: 'El cliente lo pidió por teléfono.' }),
});

export const esquemaRegistrarDevolucion = z.object({
    motivo: z.string().trim().min(1).max(500).openapi({ example: 'Talla incorrecta.' }),
    lineas: z
        .array(
            z.object({
                idPedidoDetalle: z.number().int().positive(),
                cantidad: z.number().int().min(1).max(100_000),
                reingresa: z
                    .boolean()
                    .default(true)
                    .openapi({ description: 'La unidad vuelve al inventario (buen estado) o no (dañada).' }),
            }),
        )
        .min(1)
        .max(200)
        .refine(
            (lineas) => new Set(lineas.map((l) => l.idPedidoDetalle)).size === lineas.length,
            'una línea del pedido por elemento',
        ),
});

/** Token del enlace de seguimiento: base64url de 32 bytes. */
export const esquemaTokenSeguimiento = z.object({
    token: z
        .string()
        .regex(/^[A-Za-z0-9_-]{43}$/)
        .openapi({ param: { name: 'token', in: 'path' }, example: 'q8v2yJk0x4fWm7Lh3tZr9cNa1sBe6uGd5oPiTnXwYQE' }),
});

/* === Respuesta ============================================================================ */

const esquemaLinea = z.object({
    idPedidoDetalle: z.number(),
    idVariante: z.number(),
    sku: z.string(),
    nombreProducto: z.string(),
    descripcionVariante: z.string(),
    cantidad: z.number(),
    precioUnitario: z.number(),
    descuentoLinea: z.number(),
    totalLinea: z.number(),
    cantidadDevuelta: z.number(),
});

const esquemaHistorial = z.object({
    codigoEstadoAnterior: z.string().optional(),
    codigoEstado: z.string(),
    estado: z.string(),
    fecha: z.string(),
    comentario: z.string().optional(),
    idUsuario: z.number().optional().openapi({ description: 'Solo en el panel.' }),
    usuario: z.string().optional().openapi({ description: 'Solo en el panel.' }),
});

const esquemaPago = z.object({
    idPago: z.number(),
    estado: z.enum(['APROBADO', 'RECHAZADO', 'REEMBOLSADO']),
    marca: z.string(),
    ultimos4: z.string(),
    codigoAutorizacion: z.string().nullable(),
    motivoRechazo: z.string().nullable(),
    monto: z.number(),
    referenciaExterna: z.string(),
    fecha: z.string(),
});

const esquemaDevolucionPedido = z.object({
    idDevolucion: z.number(),
    fecha: z.string(),
    motivo: z.string(),
    montoReembolso: z.number(),
    usuario: z.string().optional().openapi({ description: 'Solo en el panel.' }),
    lineas: z.array(
        z.object({
            sku: z.string(),
            nombreProducto: z.string(),
            cantidad: z.number(),
            montoReembolso: z.number(),
            reingresa: z.boolean(),
        }),
    ),
});

const camposPedido = {
    idPedido: z.number(),
    numeroPedido: z.string().openapi({ example: 'SC-000123' }),
    fechaPedido: z.string(),
    codigoEstado: z.enum(ESTADOS_PEDIDO),
    estado: z.string(),
    correoContacto: z.string(),
    nombreContacto: z.string(),
    telefonoContacto: z.string(),
    envioNombre: z.string(),
    envioTelefono: z.string(),
    envioLinea1: z.string(),
    envioLinea2: z.string().nullable(),
    envioMunicipio: z.string(),
    departamento: z.string(),
    envioCodigoPostal: z.string().nullable(),
    envioReferencias: z.string().nullable(),
    nombreMetodoEnvio: z.string(),
    codigoCupon: z.string().nullable(),
    subtotal: z.number(),
    descuento: z.number(),
    costoEnvio: z.number(),
    total: z.number(),
    baseImponible: z.number(),
    iva: z.number(),
    lineas: z.array(esquemaLinea),
    historial: z.array(esquemaHistorial),
    pagos: z.array(esquemaPago).openapi({ description: 'Solo marca y últimos 4 dígitos de la tarjeta.' }),
    devoluciones: z.array(esquemaDevolucionPedido),
};

export const esquemaPedidoCliente = z
    .object({
        ...camposPedido,
        puedeCancelar: z
            .boolean()
            .openapi({ description: 'El cliente puede cancelarlo desde la tienda (solo PAGADO y con cuenta).' }),
    })
    .openapi('PedidoCliente');

export const esquemaPedidoPanel = z
    .object({
        ...camposPedido,
        idUsuario: z.number().nullable().openapi({ description: 'null = compra de invitado.' }),
        idDepartamento: z.number(),
        puedeCancelar: z.boolean().openapi({ description: 'El estado actual permite cancelarlo.' }),
    })
    .openapi('PedidoPanel');

export const esquemaResumenPedido = z
    .object({
        idPedido: z.number(),
        numeroPedido: z.string(),
        fechaPedido: z.string(),
        codigoEstado: z.enum(ESTADOS_PEDIDO),
        estado: z.string(),
        total: z.number(),
        articulos: z.number(),
        nombreContacto: z.string().optional().openapi({ description: 'Solo en el panel.' }),
        correoContacto: z.string().optional().openapi({ description: 'Solo en el panel.' }),
        esInvitado: z.boolean().optional().openapi({ description: 'Solo en el panel.' }),
    })
    .openapi('ResumenPedido');

export const esquemaDevolucion = z
    .object({
        idDevolucion: z.number(),
        fecha: z.string(),
        idPedido: z.number(),
        numeroPedido: z.string(),
        motivo: z.string(),
        montoReembolso: z.number(),
        unidades: z.number(),
        usuario: z.string(),
    })
    .openapi('Devolucion');
