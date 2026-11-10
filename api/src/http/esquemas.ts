import { z } from '../config/zod.js';

/* Esquemas comunes de entrada. Los SPs vuelven a validar: esto da errores claros antes de ir a la base. */

export const esquemaPaginacion = z.object({
    pagina: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
    tamanoPagina: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
});

/**
 * Ordenamiento del lado del servidor: `ordenarPor` solo acepta las columnas de la lista del
 * listado (el SP vuelve a validarla) y `direccion`, ASC o DESC. Se agrega con `...esquemaOrden()`.
 */
export function esquemaOrden<const C extends readonly [string, ...string[]]>(
    columnas: C,
    porDefecto: C[number],
    direccion: 'ASC' | 'DESC',
) {
    return {
        ordenarPor: z
            .enum(columnas)
            .default(porDefecto as never)
            .openapi({ description: `Columna por la que se ordena (por defecto ${porDefecto}).` }),
        direccion: z.enum(['ASC', 'DESC']).default(direccion),
    };
}

export const esquemaId = z.object({
    id: z.coerce
        .number()
        .int()
        .positive()
        .openapi({ param: { name: 'id', in: 'path' }, example: 1 }),
});

/** "true"/"false" de la query string. */
export const booleanoQuery = z.enum(['true', 'false']).transform((valor) => valor === 'true');

/** Teléfono de Guatemala: 8 dígitos, con o sin guion en medio. */
export const esquemaTelefono = z
    .string()
    .trim()
    .regex(/^\d{4}-?\d{4}$/, '8 dígitos, como 5555-1234')
    .openapi({ example: '5555-1234' });

/**
 * Monto en quetzales con hasta 2 decimales, como número o texto ("149.99"). Se valida como
 * texto para no depender de la representación binaria de los decimales.
 */
export const esquemaMonto = z
    .union([z.number(), z.string()])
    .transform((valor) => String(valor).trim())
    .pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'monto con hasta 10 enteros y 2 decimales'))
    .transform(Number)
    .openapi({ type: 'number', example: 149.99 });

/** VersionFila del registro (control de edición concurrente), tal como la devolvió la API en base64. */
export const esquemaVersion = z
    .string()
    .regex(/^[A-Za-z0-9+/]{11}=$/, 'versión inválida: usa la versionFila que devolvió la API')
    .transform((valor) => Buffer.from(valor, 'base64'))
    .openapi({ type: 'string', example: 'AAAAAAAAB9E=' });

export const esquemaSlug = z
    .string()
    .trim()
    .min(1)
    .max(220)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'solo minúsculas sin tilde, dígitos y guiones simples')
    .openapi({ example: 'playera-basica' });
