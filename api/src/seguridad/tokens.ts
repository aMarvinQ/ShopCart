import { createHash, randomBytes } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import { ErrorApi } from '../errors/ErrorApi.js';

/*
    Access token: JWT HS256 de corta vida con lo mínimo (sub = IDUsuario, rol).
    Refresh token: 256 bits aleatorios, opaco; viaja solo en la cookie y la base guarda su
    SHA-256 (si se filtra la tabla, los tokens no sirven).
*/
export type Rol = 'CLIENTE' | 'OPERADOR' | 'ADMIN';

export interface UsuarioSesion {
    id: number;
    rol: Rol;
}

const ROLES: readonly string[] = ['CLIENTE', 'OPERADOR', 'ADMIN'];
const EMISOR = 'shopcart-api';

export class Tokens {
    private readonly clave: Uint8Array;

    constructor(
        secreto: string,
        private readonly minutosAcceso: number,
    ) {
        this.clave = new TextEncoder().encode(secreto);
    }

    get segundosAcceso(): number {
        return this.minutosAcceso * 60;
    }

    firmarAcceso(usuario: UsuarioSesion): Promise<string> {
        return new SignJWT({ rol: usuario.rol })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject(String(usuario.id))
            .setIssuer(EMISOR)
            .setIssuedAt()
            .setExpirationTime(`${this.minutosAcceso}m`)
            .sign(this.clave);
    }

    async verificarAcceso(token: string): Promise<UsuarioSesion> {
        try {
            const { payload } = await jwtVerify(token, this.clave, { issuer: EMISOR, algorithms: ['HS256'] });
            const id = Number(payload.sub);
            if (!Number.isInteger(id) || typeof payload.rol !== 'string' || !ROLES.includes(payload.rol)) {
                throw new ErrorApi(401, 'TOKEN_INVALIDO', 'El token de acceso no es válido.');
            }
            return { id, rol: payload.rol as Rol };
        } catch (error) {
            if (error instanceof ErrorApi) throw error;
            if (error instanceof errors.JWTExpired) {
                throw new ErrorApi(401, 'TOKEN_EXPIRADO', 'El token de acceso venció; renuévalo con el refresh token.');
            }
            throw new ErrorApi(401, 'TOKEN_INVALIDO', 'El token de acceso no es válido.');
        }
    }
}

export function generarRefreshToken(): string {
    return randomBytes(32).toString('base64url');
}

/** SHA-256 del refresh token: lo único que conoce la base. */
export function hashToken(token: string): Buffer {
    return createHash('sha256').update(token).digest();
}
