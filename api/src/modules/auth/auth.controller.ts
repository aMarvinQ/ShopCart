import type { CookieOptions, Request, Response } from 'express';
import type { Configuracion } from '../../config/configuracion.js';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { borrarTokenInvitado, leerTokenInvitado } from '../../http/cookieInvitado.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import { fusionarAlIniciarSesion } from '../carrito/carrito.service.js';
import type { ContextoCliente } from './auth.repository.js';
import { esquemaCambioContrasena, esquemaLogin, esquemaRegistro } from './auth.schemas.js';
import type { ServicioAuth, SesionEmitida } from './auth.service.js';

/*
    Cookie del refresh token (D67): httpOnly (JavaScript no la lee), SameSite=Strict (no viaja en
    peticiones de otros sitios), solo para /api/v1/auth, y Secure en producción (HTTPS).
*/
export const COOKIE_REFRESH = 'shopcart_refresh';
const RUTA_COOKIE = '/api/v1/auth';

export function crearControladorAuth(servicio: ServicioAuth, config: Configuracion) {
    const opcionesCookie: CookieOptions = {
        httpOnly: true,
        sameSite: 'strict',
        secure: config.NODE_ENV === 'production',
        path: RUTA_COOKIE,
    };

    const cliente = (req: Request): ContextoCliente => ({ ip: req.ip, agente: req.get('user-agent') });

    const refreshDe = (req: Request): string | undefined => {
        const valor: unknown = req.cookies[COOKIE_REFRESH];
        return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
    };

    function entregar(res: Response, emitida: SesionEmitida, estado = 200): void {
        res.cookie(COOKIE_REFRESH, emitida.refresh.token, { ...opcionesCookie, expires: emitida.refresh.expira });
        responder(res, emitida.sesion, { estado });
    }

    const limpiarCookie = (res: Response) => res.clearCookie(COOKIE_REFRESH, opcionesCookie);

    // Si llega con un carrito de invitado, sus productos pasan al carrito del cliente (D70).
    async function fusionarCarrito(req: Request, res: Response, emitida: SesionEmitida): Promise<void> {
        const tokenInvitado = leerTokenInvitado(req);
        if (!tokenInvitado || emitida.sesion.usuario.codigoRol !== 'CLIENTE') return;
        await fusionarAlIniciarSesion(emitida.sesion.usuario.idUsuario, tokenInvitado, req.log);
        borrarTokenInvitado(res, config);
    }

    return {
        registrar: async (req: Request, res: Response): Promise<void> => {
            const emitida = await servicio.registrar(validar(esquemaRegistro, req.body), cliente(req));
            await fusionarCarrito(req, res, emitida);
            entregar(res, emitida, 201);
        },

        iniciarSesion: async (req: Request, res: Response): Promise<void> => {
            const { correo, contrasena } = validar(esquemaLogin, req.body);
            const emitida = await servicio.iniciarSesion(correo, contrasena, cliente(req));
            await fusionarCarrito(req, res, emitida);
            entregar(res, emitida);
        },

        renovar: async (req: Request, res: Response): Promise<void> => {
            const refresh = refreshDe(req);
            if (!refresh) throw new ErrorApi(401, 'SESION_INVALIDA', 'No hay una sesión que renovar; inicia sesión.');
            try {
                entregar(res, await servicio.renovar(refresh, cliente(req)));
            } catch (error) {
                // Si otra pestaña acaba de renovar, su cookie nueva ya reemplazó a esta: no se borra.
                if (!(error instanceof ErrorApi && error.codigo === 'ROTACION_CONCURRENTE')) limpiarCookie(res);
                throw error;
            }
        },

        cerrarSesion: async (req: Request, res: Response): Promise<void> => {
            await servicio.cerrarSesion(refreshDe(req));
            limpiarCookie(res);
            res.status(204).end();
        },

        cambiarContrasena: async (req: Request, res: Response): Promise<void> => {
            const { contrasenaActual, contrasenaNueva } = validar(esquemaCambioContrasena, req.body);
            const resultado = await servicio.cambiarContrasena(
                usuarioDe(req).id,
                contrasenaActual,
                contrasenaNueva,
                refreshDe(req),
            );
            responder(res, resultado);
        },
    };
}
