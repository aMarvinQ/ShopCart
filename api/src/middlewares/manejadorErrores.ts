import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorApi } from '../errors/ErrorApi.js';
import { traducirErrorSql } from '../errors/errorSql.js';

/*
    Formato de los errores (D62): { error: { codigo, mensaje, detalles?, requestId } }.
    Los errores no previstos responden 500 sin detalle; el detalle queda en el log con el
    mismo requestId.
*/

export const rutaNoEncontrada: RequestHandler = (req) => {
    throw new ErrorApi(404, 'RUTA_NO_ENCONTRADA', `No existe ${req.method} ${req.path}.`);
};

// Errores del lector de JSON de Express (body-parser), identificados por su "type".
function errorDelCuerpo(error: unknown): ErrorApi | null {
    if (typeof error !== 'object' || error === null || !('type' in error)) return null;
    if (error.type === 'entity.parse.failed')
        return new ErrorApi(400, 'JSON_INVALIDO', 'El cuerpo de la petición no es un JSON válido.');
    if (error.type === 'entity.too.large')
        return new ErrorApi(413, 'CUERPO_DEMASIADO_GRANDE', 'El cuerpo de la petición es demasiado grande.');
    if (typeof error.type === 'string' && error.type.startsWith('entity.')) {
        return new ErrorApi(400, 'SOLICITUD_INVALIDA', 'El cuerpo de la petición no se pudo leer.');
    }
    return null;
}

function errorDeValidacion(error: unknown): ErrorApi | null {
    if (!(error instanceof ZodError)) return null;
    const detalles = error.issues.map((problema) => ({ campo: problema.path.join('.'), mensaje: problema.message }));
    return new ErrorApi(400, 'SOLICITUD_INVALIDA', 'Los datos enviados no son válidos.', detalles);
}

export const manejadorErrores: ErrorRequestHandler = (error: unknown, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }
    let respuesta =
        error instanceof ErrorApi
            ? error
            : (errorDeValidacion(error) ?? errorDelCuerpo(error) ?? traducirErrorSql(error));
    if (!respuesta) {
        req.log.error({ err: error }, 'Error no controlado');
        respuesta = new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error inesperado.');
    } else if (respuesta.estado >= 500) {
        req.log.error({ err: error }, respuesta.codigo);
    }
    res.status(respuesta.estado).json({
        error: {
            codigo: respuesta.codigo,
            mensaje: respuesta.message,
            ...(respuesta.detalles === undefined ? {} : { detalles: respuesta.detalles }),
            requestId: typeof req.id === 'string' ? req.id : undefined,
        },
    });
};
