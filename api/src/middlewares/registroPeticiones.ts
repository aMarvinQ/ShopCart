import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

/*
    Identificador de cada petición (X-Request-Id): se acepta el del cliente o proxy si tiene un
    formato seguro; si no, se genera. Viaja en la respuesta, en cada log y en cada error, así
    un error reportado por el usuario se encuentra en los logs.
*/
const FORMATO_ID = /^[A-Za-z0-9-]{8,64}$/;

export function registroPeticiones(logger: Logger) {
    return pinoHttp({
        logger,
        genReqId(req: IncomingMessage, res: ServerResponse) {
            const recibido = req.headers['x-request-id'];
            const id = typeof recibido === 'string' && FORMATO_ID.test(recibido) ? recibido : randomUUID();
            res.setHeader('X-Request-Id', id);
            return id;
        },
        customLogLevel(_req, res, error) {
            if (error || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
        },
        // Solo lo necesario para diagnosticar: sin cuerpo de la petición (puede tener datos sensibles).
        serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
    });
}
