import { randomBytes } from 'node:crypto';
import type { Logger } from 'pino';
import { numeroErrorSql } from '../../db/index.js';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { generarTokenOpaco, hashToken, type UsuarioSesion } from '../../seguridad/tokens.js';
import * as repositorio from './carrito.repository.js';
import type { Propietario } from './carrito.repository.js';

/*
    Lo que la API agrega al carrito: quién es el dueño (cliente del token o invitado de la
    cookie), crear el token del invitado al agregar su primer producto y fusionar al iniciar sesión.
*/
const CARRITO_CERRADO = 51303;

export interface Comprador {
    usuario: UsuarioSesion | undefined;
    tokenInvitado: string | undefined;
}

export interface ResultadoCarrito {
    carrito: Record<string, unknown>;
    /** Token nuevo del invitado: el controlador lo deja en la cookie. */
    tokenNuevo?: string;
}

/** El personal no tiene carrito (D71); el cliente se identifica por su token, el invitado por su cookie. */
function propietarioDe({ usuario, tokenInvitado }: Comprador): Propietario | null {
    if (usuario) {
        if (usuario.rol !== 'CLIENTE') {
            throw new ErrorApi(403, 'PERMISO_DENEGADO', 'El personal de la tienda no tiene carrito.');
        }
        return { idUsuario: usuario.id };
    }
    return tokenInvitado ? { tokenHash: hashToken(tokenInvitado) } : null;
}

/** Invitado sin cookie: un dueño que no tiene carrito (consultar no crea la cookie). */
const sinCarrito = (): Propietario => ({ tokenHash: randomBytes(32) });

export async function obtener(comprador: Comprador): Promise<ResultadoCarrito> {
    return { carrito: await repositorio.obtener(propietarioDe(comprador) ?? sinCarrito()) };
}

/*
    Agregar crea el carrito si no existe. Un invitado sin cookie recibe un token nuevo; si su
    token pertenece a un carrito ya pagado o fusionado (CARRITO_CERRADO), se emite otro y se
    reintenta una vez.
*/
export async function agregar(comprador: Comprador, idVariante: number, cantidad: number): Promise<ResultadoCarrito> {
    const propietario = propietarioDe(comprador);
    if (propietario) {
        try {
            return { carrito: await repositorio.agregarItem(propietario, idVariante, cantidad) };
        } catch (error) {
            if ('idUsuario' in propietario || numeroErrorSql(error) !== CARRITO_CERRADO) throw error;
        }
    }
    const tokenNuevo = generarTokenOpaco();
    const carrito = await repositorio.agregarItem({ tokenHash: hashToken(tokenNuevo) }, idVariante, cantidad);
    return { carrito, tokenNuevo };
}

/** Operaciones sobre un carrito existente: sin carrito responden CARRITO_NO_ENCONTRADO (el SP). */
export async function modificar(
    comprador: Comprador,
    operacion: (propietario: Propietario) => Promise<Record<string, unknown>>,
): Promise<ResultadoCarrito> {
    return { carrito: await operacion(propietarioDe(comprador) ?? sinCarrito()) };
}

/*
    Al iniciar sesión o registrarse con un carrito de invitado, sus productos pasan al carrito del
    cliente (D70). Si falla, el inicio de sesión no se bloquea: queda en el log.
*/
export async function fusionarAlIniciarSesion(idUsuario: number, tokenInvitado: string, log: Logger): Promise<void> {
    try {
        await repositorio.fusionar(idUsuario, hashToken(tokenInvitado));
    } catch (error) {
        log.warn({ err: error, idUsuario }, 'No se pudo fusionar el carrito del invitado');
    }
}
