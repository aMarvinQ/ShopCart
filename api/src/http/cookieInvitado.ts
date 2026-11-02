import type { CookieOptions, Request, Response } from 'express';
import type { Configuracion } from '../config/configuracion.js';

/*
    Cookie del comprador invitado (D69): token aleatorio de 256 bits; la base guarda solo su
    SHA-256. httpOnly y SameSite=Strict; Path=/api/v1 para que la reciban el carrito, el
    checkout y el seguimiento de pedidos; 30 días; Secure en producción.
*/
export const COOKIE_INVITADO = 'shopcart_invitado';
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000;

function opciones(config: Configuracion): CookieOptions {
    return { httpOnly: true, sameSite: 'strict', secure: config.NODE_ENV === 'production', path: '/api/v1' };
}

/** Token de la cookie, si tiene el formato que emite la API (base64url de 32 bytes). */
export function leerTokenInvitado(req: Request): string | undefined {
    const valor: unknown = req.cookies[COOKIE_INVITADO];
    return typeof valor === 'string' && /^[A-Za-z0-9_-]{43}$/.test(valor) ? valor : undefined;
}

export function escribirTokenInvitado(res: Response, config: Configuracion, token: string): void {
    res.cookie(COOKIE_INVITADO, token, { ...opciones(config), maxAge: VIGENCIA_MS });
}

export function borrarTokenInvitado(res: Response, config: Configuracion): void {
    res.clearCookie(COOKIE_INVITADO, opciones(config));
}
