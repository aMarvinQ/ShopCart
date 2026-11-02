import type { Request, RequestHandler } from 'express';
import { ErrorApi } from '../errors/ErrorApi.js';
import type { Rol, Tokens, UsuarioSesion } from '../seguridad/tokens.js';

export interface Autenticacion {
    /** Exige un access token válido (Authorization: Bearer ...) y deja el usuario en req.usuario. */
    autenticar: RequestHandler;
    /** Exige uno de los roles. Va después de autenticar. Los SPs vuelven a validar el rol. */
    autorizar: (...roles: Rol[]) => RequestHandler;
}

export function crearAutenticacion(tokens: Tokens): Autenticacion {
    const autenticar: RequestHandler = async (req, _res, next) => {
        const [esquema, token] = (req.headers.authorization ?? '').split(' ');
        if (esquema !== 'Bearer' || !token) {
            throw new ErrorApi(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
        }
        req.usuario = await tokens.verificarAcceso(token);
        next();
    };

    const autorizar =
        (...roles: Rol[]): RequestHandler =>
        (req, _res, next) => {
            if (!req.usuario) throw new ErrorApi(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
            if (!roles.includes(req.usuario.rol)) {
                throw new ErrorApi(403, 'PERMISO_DENEGADO', 'No tienes permiso para esta acción.');
            }
            next();
        };

    return { autenticar, autorizar };
}

/** Usuario autenticado de la petición (las rutas que lo usan pasan antes por autenticar). */
export function usuarioDe(req: Request): UsuarioSesion {
    if (!req.usuario) throw new ErrorApi(401, 'NO_AUTENTICADO', 'Inicia sesión para continuar.');
    return req.usuario;
}
