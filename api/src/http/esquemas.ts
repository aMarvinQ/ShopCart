import { z } from '../config/zod.js';

/* Esquemas comunes de entrada. Los SPs vuelven a validar: esto da errores claros antes de ir a la base. */

export const esquemaPaginacion = z.object({
    pagina: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
    tamanoPagina: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
});

export const esquemaId = z.object({
    id: z.coerce
        .number()
        .int()
        .positive()
        .openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
});

/** "true"/"false" de la query string. */
export const booleanoQuery = z.enum(['true', 'false']).transform((valor) => valor === 'true');

export const esquemaTelefono = z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\- ]+$/, 'solo dígitos, espacios, + y -')
    .openapi({ example: '5555-1234' });
