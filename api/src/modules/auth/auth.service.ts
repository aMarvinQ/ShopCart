import { ErrorApi } from '../../errors/ErrorApi.js';
import { hashearContrasena, verificacionFicticia, verificarContrasena } from '../../seguridad/contrasenas.js';
import { generarRefreshToken, hashToken, type Tokens } from '../../seguridad/tokens.js';
import * as repositorio from './auth.repository.js';
import type { ContextoCliente, ResultadoRotacion, UsuarioSesionFila } from './auth.repository.js';
import type { DatosRegistro, Sesion } from './auth.schemas.js';

/** Sesión emitida: el access token va en la respuesta; el refresh token, en la cookie. */
export interface SesionEmitida {
    sesion: Sesion;
    refresh: { token: string; expira: Date };
}

const CREDENCIALES_INVALIDAS = () => new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Correo o contraseña incorrectos.');

/* Mensaje para cada resultado de la rotación que no emite token (docs/errores.md). */
const RECHAZOS_ROTACION: Record<Exclude<ResultadoRotacion, 'ROTADO'>, string> = {
    ROTACION_CONCURRENTE: 'La sesión se renovó en otra pestaña; usa el token más reciente.',
    REUSO_DETECTADO: 'Se detectó el reúso de un token de sesión: por seguridad se cerró la sesión.',
    SESION_EXPIRADA: 'La sesión venció; inicia sesión de nuevo.',
    USUARIO_INACTIVO: 'La cuenta está desactivada.',
    SESION_INVALIDA: 'La sesión no es válida; inicia sesión de nuevo.',
};

export function crearServicioAuth(tokens: Tokens) {
    async function emitir(usuario: UsuarioSesionFila, refreshToken: string, expira: Date): Promise<SesionEmitida> {
        const accessToken = await tokens.firmarAcceso({ id: usuario.idUsuario, rol: usuario.codigoRol });
        return {
            sesion: {
                accessToken,
                tipo: 'Bearer',
                expiraEn: tokens.segundosAcceso,
                usuario: {
                    idUsuario: usuario.idUsuario,
                    correo: usuario.correo,
                    nombre: usuario.nombre,
                    apellido: usuario.apellido,
                    codigoRol: usuario.codigoRol,
                },
            },
            refresh: { token: refreshToken, expira },
        };
    }

    async function abrirSesion(idUsuario: number, cliente: ContextoCliente): Promise<SesionEmitida> {
        const refreshToken = generarRefreshToken();
        const fila = await repositorio.iniciarSesion(idUsuario, hashToken(refreshToken), cliente);
        return emitir(fila, refreshToken, fila.fechaExpiracion);
    }

    return {
        /** Registro de un cliente; queda con la sesión iniciada. */
        async registrar(datos: DatosRegistro, cliente: ContextoCliente): Promise<SesionEmitida> {
            const usuario = await repositorio.registrarCliente(datos, await hashearContrasena(datos.contrasena));
            return abrirSesion(usuario.idUsuario, cliente);
        },

        /*
            Mismo error y mismo costo si el correo no existe o la contraseña no coincide: la
            respuesta no revela qué correos tienen cuenta. La cuenta desactivada se informa solo
            después de validar la contraseña.
        */
        async iniciarSesion(correo: string, contrasena: string, cliente: ContextoCliente): Promise<SesionEmitida> {
            const credenciales = await repositorio.obtenerCredenciales({ correo });
            if (!credenciales?.hashContrasena) {
                await verificacionFicticia(contrasena);
                throw CREDENCIALES_INVALIDAS();
            }
            if (!(await verificarContrasena(credenciales.hashContrasena, contrasena))) throw CREDENCIALES_INVALIDAS();
            if (!credenciales.activo) throw new ErrorApi(401, 'USUARIO_INACTIVO', 'La cuenta está desactivada.');
            return abrirSesion(credenciales.idUsuario, cliente);
        },

        /** Rota el refresh token: el actual queda revocado y se emite uno nuevo con un access token nuevo. */
        async renovar(refreshActual: string, cliente: ContextoCliente): Promise<SesionEmitida> {
            const refreshNuevo = generarRefreshToken();
            const fila = await repositorio.rotarSesion(hashToken(refreshActual), hashToken(refreshNuevo), cliente);
            if (fila.resultado !== 'ROTADO' || !fila.idUsuario || !fila.fechaExpiracion) {
                const codigo = fila.resultado === 'ROTADO' ? 'SESION_INVALIDA' : fila.resultado;
                throw new ErrorApi(401, codigo, RECHAZOS_ROTACION[codigo]);
            }
            return emitir(fila as UsuarioSesionFila, refreshNuevo, fila.fechaExpiracion);
        },

        async cerrarSesion(refreshToken: string | undefined): Promise<void> {
            if (refreshToken) await repositorio.cerrarSesion(hashToken(refreshToken));
        },

        /** Cambia la contraseña y cierra las demás sesiones; la actual sigue abierta. */
        async cambiarContrasena(
            idUsuario: number,
            actual: string,
            nueva: string,
            refreshToken: string | undefined,
        ): Promise<{ sesionesCerradas: number }> {
            const credenciales = await repositorio.obtenerCredenciales({ idUsuario });
            if (!credenciales?.hashContrasena || !credenciales.activo) {
                throw new ErrorApi(401, 'USUARIO_INACTIVO', 'La cuenta está desactivada.');
            }
            if (!(await verificarContrasena(credenciales.hashContrasena, actual))) {
                throw new ErrorApi(422, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta.');
            }
            const sesionesCerradas = await repositorio.cambiarContrasena(
                idUsuario,
                await hashearContrasena(nueva),
                refreshToken ? hashToken(refreshToken) : null,
            );
            return { sesionesCerradas };
        },
    };
}

export type ServicioAuth = ReturnType<typeof crearServicioAuth>;
