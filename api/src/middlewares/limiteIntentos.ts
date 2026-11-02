import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Configuracion } from '../config/configuracion.js';
import { ErrorApi } from '../errors/ErrorApi.js';

/*
    Límite de intentos en autenticación (D66) y en el pago (D75), en memoria del proceso (una instancia de la API;
    con varias haría falta un almacén compartido como Redis). Al superarlo: 429 con Retry-After.
*/
export interface LimitesIntentos {
    /** Login: 10 intentos fallidos por IP y correo, y 50 por IP, cada 15 minutos. */
    login: RequestHandler[];
    /** Registro: 5 por IP cada hora. */
    registro: RequestHandler;
    /** Renovación de sesión: 60 por IP cada 15 minutos. */
    refresh: RequestHandler;
    /** Pago (D75): 10 intentos fallidos por IP cada 15 minutos (evita probar tarjetas robadas). */
    pago: RequestHandler;
}

const QUINCE_MINUTOS = 15 * 60 * 1000;

function ip(req: Request): string {
    return ipKeyGenerator(req.ip ?? 'desconocida');
}

function correo(req: Request): string {
    const cuerpo: unknown = req.body;
    const valor = typeof cuerpo === 'object' && cuerpo !== null && 'correo' in cuerpo ? cuerpo.correo : '';
    return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

export function crearLimitesIntentos(config: Configuracion): LimitesIntentos {
    const limite = (ventanaMs: number, maximo: number, clave: (req: Request) => string, soloFallidos: boolean) =>
        rateLimit({
            windowMs: ventanaMs,
            limit: maximo,
            standardHeaders: 'draft-8',
            legacyHeaders: false,
            skipSuccessfulRequests: soloFallidos,
            keyGenerator: clave,
            skip: () => config.LIMITE_INTENTOS === 'inactivo',
            handler: (_req, _res, next) => {
                next(
                    new ErrorApi(
                        429,
                        'DEMASIADOS_INTENTOS',
                        'Demasiados intentos; espera unos minutos e intenta de nuevo.',
                    ),
                );
            },
        });

    return {
        login: [
            limite(QUINCE_MINUTOS, 10, (req) => `${ip(req)}|${correo(req)}`, true),
            limite(QUINCE_MINUTOS, 50, ip, true),
        ],
        registro: limite(60 * 60 * 1000, 5, ip, false),
        refresh: limite(QUINCE_MINUTOS, 60, ip, false),
        pago: limite(QUINCE_MINUTOS, 10, ip, true),
    };
}
