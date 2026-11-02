import { OpenAPIRegistry, OpenApiGeneratorV31, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { ZodObject, ZodType } from 'zod';
import { z } from '../config/zod.js';

/*
    Documentación OpenAPI generada de los mismos esquemas zod que validan las peticiones (D68):
    cada archivo de rutas registra sus endpoints con documentar(), así no puede desincronizarse.
*/
export const registro = new OpenAPIRegistry();

registro.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Access token de /auth/login o /auth/refresh.',
});

const esquemaError = registro.register(
    'Error',
    z.object({
        error: z.object({
            codigo: z.string().openapi({ example: 'PERMISO_DENEGADO' }),
            mensaje: z.string(),
            detalles: z.array(z.object({ campo: z.string(), mensaje: z.string() })).optional(),
            requestId: z.string(),
        }),
    }),
);

const DESCRIPCION_ERROR: Record<number, string> = {
    400: 'Datos de entrada inválidos',
    401: 'Sin sesión o token inválido o vencido',
    402: 'Pago rechazado por el banco',
    403: 'Sin permiso para la acción',
    404: 'No encontrado',
    409: 'Conflicto con el estado actual',
    422: 'Regla de negocio no cumplida',
    429: 'Demasiados intentos',
};

const esquemaMeta = z.object({ pagina: z.number(), tamanoPagina: z.number(), totalRegistros: z.number() });

export interface DefinicionRuta {
    metodo: 'get' | 'post' | 'put' | 'patch' | 'delete';
    /** Ruta relativa a /api/v1 con parámetros en formato OpenAPI: /direcciones/{id}. */
    ruta: string;
    etiqueta: string;
    resumen: string;
    descripcion?: string;
    /** Roles permitidos; si se indica, la ruta requiere token. */
    roles?: string[];
    autenticado?: boolean;
    params?: ZodObject;
    query?: ZodObject;
    /** Cabeceras de la petición (p. ej. Idempotency-Key). */
    cabeceras?: ZodObject;
    cuerpo?: ZodType;
    /** Formato del cuerpo: JSON (por defecto) o multipart/form-data (subida de archivos). */
    tipoCuerpo?: 'json' | 'multipart';
    /** Esquema de "data" en la respuesta exitosa. */
    respuesta?: ZodType;
    conMeta?: boolean;
    estado?: number;
    errores?: number[];
}

export function documentar(definicion: DefinicionRuta): void {
    const autenticado = definicion.autenticado === true || definicion.roles !== undefined;
    const estado = definicion.estado ?? 200;
    const roles = definicion.roles ? `\n\n**Roles:** ${definicion.roles.join(', ')}.` : '';
    const descripcion = `${definicion.descripcion ?? ''}${roles}`.trim();
    const exito = definicion.respuesta
        ? {
              content: {
                  'application/json': {
                      schema: definicion.conMeta
                          ? z.object({ data: definicion.respuesta, meta: esquemaMeta })
                          : z.object({ data: definicion.respuesta }),
                  },
              },
          }
        : {};
    const errores = new Set([
        ...(definicion.errores ?? []),
        ...(autenticado ? [401] : []),
        ...(definicion.roles ? [403] : []),
    ]);
    const ruta: RouteConfig = {
        method: definicion.metodo,
        path: `/api/v1${definicion.ruta}`,
        tags: [definicion.etiqueta],
        summary: definicion.resumen,
        ...(descripcion ? { description: descripcion } : {}),
        security: autenticado ? [{ bearerAuth: [] }] : [],
        request: {
            ...(definicion.params ? { params: definicion.params } : {}),
            ...(definicion.query ? { query: definicion.query } : {}),
            ...(definicion.cabeceras ? { headers: definicion.cabeceras } : {}),
            ...(definicion.cuerpo
                ? {
                      body: {
                          content: {
                              [definicion.tipoCuerpo === 'multipart' ? 'multipart/form-data' : 'application/json']: {
                                  schema: definicion.cuerpo,
                              },
                          },
                      },
                  }
                : {}),
        },
        responses: {
            [estado]: { description: estado === 204 ? 'Sin contenido' : 'Éxito', ...exito },
            ...Object.fromEntries(
                [...errores].map((codigo) => [
                    codigo,
                    {
                        description: DESCRIPCION_ERROR[codigo] ?? 'Error',
                        content: { 'application/json': { schema: esquemaError } },
                    },
                ]),
            ),
        },
    };
    registro.registerPath(ruta);
}

const DESCRIPCION_API = [
    'API de ShopCart. Todo acceso a datos es por stored procedures.',
    'Errores: `{ error: { codigo, mensaje, requestId } }`, con los códigos de docs/errores.md.',
    'Para probar las rutas protegidas: inicia sesión en **POST /auth/login**, copia `accessToken` y pégalo en **Authorize**.',
    'El refresh token viaja en una cookie httpOnly que el navegador envía solo a /api/v1/auth.',
].join('\n\n');

export function generarDocumento(): ReturnType<OpenApiGeneratorV31['generateDocument']> {
    return new OpenApiGeneratorV31(registro.definitions).generateDocument({
        openapi: '3.1.0',
        info: { title: 'ShopCart API', version: '1.0.0', description: DESCRIPCION_API },
        servers: [{ url: '/' }],
    });
}
