import { z } from './zod.js';

/*
    Configuración de la API, validada al arrancar: si falta un valor o es inválido, la API no
    levanta y el mensaje dice cuál (nunca muestra su contenido: puede ser un secreto).
*/

const booleano = z.enum(['true', 'false']).transform((valor) => valor === 'true');

const esquema = z
    .object({
        NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
        PUERTO: z.coerce.number().int().min(1).max(65535).default(3000),
        LOG_NIVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

        DB_SERVIDOR: z.string().min(1),
        DB_PUERTO: z.coerce.number().int().min(1).max(65535).default(1433),
        DB_NOMBRE: z.string().regex(/^ShopCart(_[A-Za-z0-9]+)?$/, 'debe ser ShopCart o ShopCart_<sufijo>'),
        DB_USUARIO: z.string().min(1),
        DB_CONTRASENA: z.string().min(1),
        DB_CONFIAR_CERTIFICADO: booleano.default(false),

        JWT_SECRETO: z.string().min(32, 'debe tener al menos 32 caracteres'),
        JWT_ACCESO_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),

        CORS_ORIGENES: z
            .string()
            .min(1)
            .transform((valor) =>
                valor
                    .split(',')
                    .map((origen) => origen.trim())
                    .filter(Boolean),
            )
            .pipe(z.array(z.url()).min(1)),
        CARPETA_UPLOADS: z.string().min(1).default('uploads'),
        // Límite de intentos en login/registro/refresh (D66). "inactivo" solo para pruebas automatizadas.
        LIMITE_INTENTOS: z.enum(['activo', 'inactivo']).default('activo'),
        // Documentación interactiva en /api/v1/docs (D68).
        DOCS_ACTIVAS: booleano.default(true),
    })
    // Protección: las pruebas crean y modifican datos, nunca deben correr sobre la base principal.
    .refine((c) => c.NODE_ENV === 'test' || c.LIMITE_INTENTOS === 'activo', {
        path: ['LIMITE_INTENTOS'],
        message: 'solo puede desactivarse en las pruebas (NODE_ENV=test)',
    })
    .refine((c) => c.NODE_ENV !== 'test' || c.DB_NOMBRE !== 'ShopCart', {
        path: ['DB_NOMBRE'],
        message: 'las pruebas no pueden ejecutarse sobre la base ShopCart (usa DB_NOMBRE_PRUEBAS)',
    });

export type Configuracion = z.infer<typeof esquema>;

export class ConfiguracionInvalidaError extends Error {
    constructor(readonly problemas: string[]) {
        super(`Configuración inválida:\n${problemas.map((p) => `  - ${p}`).join('\n')}`);
        this.name = 'ConfiguracionInvalidaError';
    }
}

export function cargarConfiguracion(origen: NodeJS.ProcessEnv = process.env): Configuracion {
    const resultado = esquema.safeParse(origen);
    if (!resultado.success) {
        throw new ConfiguracionInvalidaError(
            resultado.error.issues.map(
                (problema) => `${problema.path.join('.') || 'configuración'}: ${problema.message}`,
            ),
        );
    }
    return resultado.data;
}
