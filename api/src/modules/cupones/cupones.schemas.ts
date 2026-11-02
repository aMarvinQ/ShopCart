import { z } from '../../config/zod.js';
import { esquemaMonto, esquemaPaginacion, esquemaVersion } from '../../http/esquemas.js';

const SITUACIONES = ['VIGENTE', 'PROGRAMADO', 'VENCIDO', 'AGOTADO', 'INACTIVO'] as const;

export const esquemaListarCupones = esquemaPaginacion.extend({
    busqueda: z.string().trim().max(100).optional().openapi({ description: 'Código o descripción (contiene).' }),
    situacion: z.enum(SITUACIONES).optional(),
});

const limite = z.number().int().min(1).max(1_000_000).nullable().optional();

export const esquemaDatosCupon = z.object({
    codigo: z
        .string()
        .trim()
        .min(3)
        .max(30)
        .regex(/^[A-Za-z0-9_-]+$/, 'letras sin tilde, dígitos, guion y guion bajo')
        .openapi({ example: 'VERANO20', description: 'Se guarda en mayúsculas.' }),
    descripcion: z.string().trim().min(1).max(300).openapi({ example: '20 % en toda la tienda.' }),
    tipoDescuento: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
    valor: esquemaMonto.openapi({ description: 'Porcentaje (hasta 100) o monto en quetzales.' }),
    montoMinimo: esquemaMonto.default(0).openapi({ description: 'Subtotal mínimo de compra (0 = sin mínimo).' }),
    fechaInicio: z.coerce.date().openapi({ type: 'string', format: 'date-time', example: '2026-11-01T06:00:00Z' }),
    fechaFin: z.coerce.date().openapi({ type: 'string', format: 'date-time', example: '2026-12-01T06:00:00Z' }),
    limiteUsosTotal: limite.openapi({ description: 'null = sin límite.' }),
    limiteUsosPorCliente: limite.openapi({ description: 'Se cuenta por correo; null = sin límite.' }),
    idCategoria: z
        .number()
        .int()
        .positive()
        .nullable()
        .optional()
        .openapi({ description: 'Solo productos de esta categoría.' }),
    soloRegistrados: z.boolean().default(false),
});

export const esquemaActualizarCupon = esquemaDatosCupon.extend({ versionFila: esquemaVersion });

export const esquemaCupon = z
    .object({
        idCupon: z.number(),
        codigo: z.string(),
        descripcion: z.string(),
        tipoDescuento: z.enum(['PORCENTAJE', 'MONTO_FIJO']),
        valor: z.number(),
        montoMinimo: z.number(),
        fechaInicio: z.string(),
        fechaFin: z.string(),
        limiteUsosTotal: z.number().nullable(),
        limiteUsosPorCliente: z.number().nullable(),
        usosActuales: z.number(),
        idCategoria: z.number().nullable(),
        categoria: z.string().nullable(),
        soloRegistrados: z.boolean(),
        activo: z.boolean(),
        situacion: z.enum(SITUACIONES),
        montoDescontado: z.number().optional(),
        terminosBloqueados: z
            .boolean()
            .optional()
            .openapi({ description: 'Ya se usó: su código, tipo, valor y categoría ya no se pueden cambiar.' }),
        fechaCreacion: z.string().optional(),
        fechaModificacion: z.string().nullable().optional(),
        versionFila: z.string().optional(),
    })
    .openapi('Cupon');

export type DatosCupon = z.infer<typeof esquemaDatosCupon>;
