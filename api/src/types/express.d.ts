import type { UsuarioSesion } from '../seguridad/tokens.js';

declare global {
    namespace Express {
        interface Request {
            /** Usuario autenticado, tomado del JWT por el middleware autenticar (nunca del cuerpo). */
            usuario?: UsuarioSesion;
        }
    }
}

export {};
