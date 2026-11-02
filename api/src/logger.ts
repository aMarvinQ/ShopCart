import { pino, type Logger } from 'pino';
import type { Configuracion } from './config/configuracion.js';

/*
    Logs JSON estructurados. Nunca se registran credenciales, tokens ni datos de tarjeta
    (PCI DSS): se reemplazan por "[OCULTO]" donde aparezcan.
*/
const CAMPOS_OCULTOS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'res.headers["set-cookie"]',
    '*.contrasena',
    '*.contrasenaActual',
    '*.contrasenaNueva',
    '*.password',
    '*.token',
    '*.refreshToken',
    '*.numeroTarjeta',
    '*.cvv',
    '*.vencimiento',
];

export function crearLogger(config: Pick<Configuracion, 'NODE_ENV' | 'LOG_NIVEL'>): Logger {
    return pino({
        level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_NIVEL,
        redact: { paths: CAMPOS_OCULTOS, censor: '[OCULTO]' },
        // En desarrollo, legible en consola; en producción, JSON para el colector de logs.
        ...(config.NODE_ENV === 'development'
            ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
            : {}),
    });
}
