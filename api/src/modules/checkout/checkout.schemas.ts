import { z } from '../../config/zod.js';
import { revisarTarjeta } from '../../pagos/tarjeta.js';
import { esquemaDatosDireccion } from '../direcciones/direcciones.schemas.js';
import { esquemaPedidoCliente } from '../pedidos/pedidos.schemas.js';

/* === Entrada ============================================================================== */

/** Cabecera Idempotency-Key (D72): un UUID por cada vez que el comprador pasa al pago. */
export const esquemaCabeceraIdempotencia = z.object({
    'idempotency-key': z.uuid('la cabecera Idempotency-Key debe ser un UUID').openapi({
        example: '3f6c2a1e-8d4b-4c7a-9e2f-1b5d7c9a0e34',
        description: 'Repetir la petición con la misma clave devuelve el mismo checkout (doble clic, reintento).',
    }),
});

/** Datos del invitado: contacto y dirección de envío (mismas reglas que la libreta). */
export const esquemaDatosInvitado = esquemaDatosDireccion.omit({ alias: true }).extend({
    correo: z.email('correo inválido').max(254).openapi({ example: 'invitado@correo.com' }),
});

export const esquemaIniciarCheckout = z
    .object({
        idMetodoEnvio: z.number().int().positive().openapi({ example: 2 }),
        idDireccion: z
            .number()
            .int()
            .positive()
            .optional()
            .openapi({ description: 'Cliente registrado: una dirección de su libreta.' }),
        invitado: esquemaDatosInvitado.optional().openapi({ description: 'Invitado: su correo y la dirección.' }),
    })
    .refine((d) => d.idDireccion === undefined || d.invitado === undefined, {
        message: 'envía idDireccion (cliente) o invitado, no ambos',
        path: ['invitado'],
    });

export const esquemaTarjeta = z
    .object({
        numero: z.string().trim().max(30).openapi({ example: '4242 4242 4242 4242' }),
        titular: z.string().trim().min(2).max(100).openapi({ example: 'MARIA LOPEZ' }),
        vencimiento: z.string().trim().max(5).openapi({ example: '12/30', description: 'MM/AA.' }),
        cvv: z.string().trim().max(4).openapi({ example: '123' }),
    })
    .superRefine((tarjeta, contexto) => {
        for (const problema of revisarTarjeta(tarjeta)) {
            contexto.addIssue({ code: 'custom', path: [problema.campo], message: problema.mensaje });
        }
    });

export const esquemaPagar = z.object({
    tarjeta: esquemaTarjeta.openapi({
        description:
            'Nunca se guarda ni se registra: a la base llegan solo la marca y los últimos 4 dígitos (PCI DSS). ' +
            'Tarjetas de prueba en el README.',
    }),
});

/* === Respuesta ============================================================================ */

export const esquemaCheckout = z
    .object({
        idCheckout: z.number(),
        estado: z.enum(['PENDIENTE', 'EXPIRADO', 'CANCELADO', 'COMPLETADO', 'CARRITO_MODIFICADO']).openapi({
            description: 'Solo PENDIENTE se puede pagar. CARRITO_MODIFICADO: el carrito cambió; inicia otro checkout.',
        }),
        fechaCreacion: z.string(),
        fechaExpiracion: z.string(),
        segundosRestantes: z.number().openapi({ description: 'Para la cuenta regresiva de la reserva.' }),
        correoContacto: z.string(),
        nombreContacto: z.string(),
        telefonoContacto: z.string(),
        idDireccion: z.number().nullable(),
        envioNombre: z.string(),
        envioTelefono: z.string(),
        envioLinea1: z.string(),
        envioLinea2: z.string().nullable(),
        envioMunicipio: z.string(),
        idDepartamento: z.number(),
        departamento: z.string(),
        envioCodigoPostal: z.string().nullable(),
        envioReferencias: z.string().nullable(),
        idMetodoEnvio: z.number(),
        metodoEnvio: z.string(),
        diasEstimadosMin: z.number(),
        diasEstimadosMax: z.number(),
        codigoCupon: z.string().nullable(),
        subtotal: z.number(),
        descuento: z.number(),
        costoEnvio: z.number(),
        total: z.number(),
        baseImponible: z.number(),
        iva: z.number(),
        idPedido: z.number().nullable().openapi({ description: 'Si ya se pagó.' }),
        numeroPedido: z.string().nullable(),
        lineas: z.array(
            z.object({
                idVariante: z.number(),
                sku: z.string(),
                producto: z.string(),
                slug: z.string(),
                descripcion: z.string(),
                imagen: z.string().nullable(),
                textoAlternativo: z.string().nullable(),
                cantidad: z.number(),
                precioUnitario: z.number(),
                descuentoLinea: z.number(),
                totalLinea: z.number(),
            }),
        ),
    })
    .openapi('Checkout');

export const esquemaPagoRealizado = z
    .object({
        pedido: esquemaPedidoCliente,
        tokenSeguimiento: z.string().openapi({
            description: 'Enlace secreto /seguimiento/{token}: se puede seguir el pedido sin sesión. Guárdalo.',
        }),
    })
    .openapi('PagoRealizado');

export type DatosInvitado = z.infer<typeof esquemaDatosInvitado>;
export type DatosIniciarCheckout = z.infer<typeof esquemaIniciarCheckout>;
