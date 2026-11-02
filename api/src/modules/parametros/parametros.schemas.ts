import { z } from '../../config/zod.js';
import { esquemaVersion } from '../../http/esquemas.js';

export const esquemaClave = z.object({
    clave: z
        .string()
        .regex(/^[A-Z][A-Z0-9_]{0,49}$/, 'clave en mayúsculas, como MINUTOS_RESERVA')
        .openapi({ param: { name: 'clave', in: 'path' }, example: 'MINUTOS_RESERVA' }),
});

export const esquemaActualizarParametro = z.object({
    valor: z
        .union([z.string(), z.number()])
        .transform((valor) => String(valor).trim())
        .pipe(z.string().min(1).max(200))
        .openapi({ type: 'string', example: '20', description: 'El SP valida el tipo y el rango del parámetro.' }),
    versionFila: esquemaVersion,
});

export const esquemaParametro = z
    .object({
        idParametro: z.number(),
        clave: z.string(),
        valor: z.string(),
        tipoDato: z.enum(['ENTERO', 'DECIMAL', 'TEXTO']).or(z.string()),
        descripcion: z.string(),
        valorMinimo: z.number().nullable(),
        valorMaximo: z.number().nullable(),
        fechaModificacion: z.string().nullable(),
        versionFila: z.string(),
    })
    .openapi('Parametro');
