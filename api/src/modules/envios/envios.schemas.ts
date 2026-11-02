import { z } from '../../config/zod.js';
import { esquemaMonto, esquemaVersion } from '../../http/esquemas.js';

export const esquemaDepartamento = z.object({ idDepartamento: z.number(), nombre: z.string() }).openapi('Departamento');
export const esquemaMunicipio = z.object({ idMunicipio: z.number(), nombre: z.string() }).openapi('Municipio');
export const esquemaIdDepartamento = z.object({
    id: z.coerce
        .number()
        .int()
        .min(1)
        .max(255)
        .openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
});

/* --- Métodos de envío ---------------------------------------------------------------------- */

const dias = z.number().int().min(0).max(255);

export const esquemaDatosMetodo = z
    .object({
        nombre: z.string().trim().min(1).max(100).openapi({ example: 'Envío nocturno' }),
        descripcion: z
            .string()
            .trim()
            .max(300)
            .transform((valor) => valor || null)
            .nullable()
            .optional(),
        costo: esquemaMonto.openapi({ description: 'En quetzales; 0 se permite (p. ej. recoger en tienda).' }),
        diasEstimadosMin: dias.openapi({ example: 1 }),
        diasEstimadosMax: dias.openapi({ example: 3 }),
    })
    .refine((d) => d.diasEstimadosMin <= d.diasEstimadosMax, {
        path: ['diasEstimadosMax'],
        message: 'debe ser mayor o igual que diasEstimadosMin',
    });

export const esquemaActualizarMetodo = z.intersection(esquemaDatosMetodo, z.object({ versionFila: esquemaVersion }));

export const esquemaMetodoTienda = z
    .object({
        idMetodoEnvio: z.number(),
        nombre: z.string(),
        descripcion: z.string().nullable(),
        costo: z.number(),
        diasEstimadosMin: z.number(),
        diasEstimadosMax: z.number(),
    })
    .openapi('MetodoEnvioTienda');

export const esquemaMetodo = esquemaMetodoTienda
    .extend({
        activo: z.boolean(),
        pedidos: z.number().optional().openapi({ description: 'Pedidos que lo usaron (detalle).' }),
        fechaCreacion: z.string(),
        fechaModificacion: z.string().nullable(),
        versionFila: z.string().optional(),
    })
    .openapi('MetodoEnvio');
