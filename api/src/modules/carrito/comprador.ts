import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { TipoSql, type Parametro } from '../../db/index.js';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { leerTokenInvitado } from '../../http/cookieInvitado.js';
import { hashToken, type UsuarioSesion } from '../../seguridad/tokens.js';

/*
    Quién compra: un cliente (su access token) o un invitado (el token de su cookie). Lo usan el
    carrito y el checkout, que tienen el mismo dueño. El comprador sale siempre de la sesión,
    nunca del cuerpo de la petición.
*/
export interface Comprador {
    usuario: UsuarioSesion | undefined;
    tokenInvitado: string | undefined;
}

/** Dueño del carrito o del checkout en la base: el cliente o el SHA-256 del token del invitado. */
export type Propietario = { idUsuario: number } | { tokenHash: Buffer };

export const compradorDe = (req: Request): Comprador => ({
    usuario: req.usuario,
    tokenInvitado: leerTokenInvitado(req),
});

/** El personal no compra (D71); el cliente se identifica por su token, el invitado por su cookie. */
export function propietarioDe({ usuario, tokenInvitado }: Comprador): Propietario | null {
    if (usuario) {
        if (usuario.rol !== 'CLIENTE') {
            throw new ErrorApi(403, 'PERMISO_DENEGADO', 'El personal de la tienda no tiene carrito ni compra.');
        }
        return { idUsuario: usuario.id };
    }
    return tokenInvitado ? { tokenHash: hashToken(tokenInvitado) } : null;
}

/**
 * Invitado sin cookie: un dueño que no tiene nada (hash aleatorio). Consultar no crea la cookie
 * y los SPs responden "no encontrado" como con cualquier carrito o checkout ajeno.
 */
export const sinCarrito = (): Propietario => ({ tokenHash: randomBytes(32) });

export const propietarioODesconocido = (comprador: Comprador): Propietario => propietarioDe(comprador) ?? sinCarrito();

/** Parámetros @IDUsuario o @TokenInvitadoHash de los SPs del carrito y del checkout. */
export function parametrosPropietario(p: Propietario): Record<string, Parametro> {
    return 'idUsuario' in p
        ? { IDUsuario: { tipo: TipoSql.Int, valor: p.idUsuario } }
        : { TokenInvitadoHash: { tipo: TipoSql.VarBinary(64), valor: p.tokenHash } };
}
