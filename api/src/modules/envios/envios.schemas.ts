import { z } from '../../config/zod.js';

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
