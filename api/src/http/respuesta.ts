import type { Response } from 'express';
import type { ZodType } from 'zod';

/* Formato de las respuestas exitosas (D62): { data } o { data, meta } en los listados. */
export interface Meta {
    pagina?: number;
    tamanoPagina?: number;
    totalRegistros?: number;
    /** Reportes: cuándo se calcularon los datos (pueden venir del caché). */
    generadoEn?: string;
}

export function responder(res: Response, data: unknown, opciones: { estado?: number; meta?: Meta } = {}): void {
    res.status(opciones.estado ?? 200).json(opciones.meta ? { data, meta: opciones.meta } : { data });
}

/**
 * Valida y convierte los datos de entrada con su esquema. Si no cumplen, lanza el ZodError
 * que el manejador de errores responde como 400 SOLICITUD_INVALIDA con el detalle por campo.
 */
export function validar<T>(esquema: ZodType<T>, datos: unknown): T {
    return esquema.parse(datos);
}
