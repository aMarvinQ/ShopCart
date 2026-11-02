import type { Logger } from 'pino';
import { numeroErrorSql } from '../../db/index.js';
import { generarTokenOpaco, hashToken } from '../../seguridad/tokens.js';
import * as repositorio from './carrito.repository.js';
import { propietarioDe, propietarioODesconocido, type Comprador, type Propietario } from './comprador.js';

/*
    Lo que la API agrega al carrito: quién es el dueño (cliente del token o invitado de la
    cookie), crear el token del invitado al agregar su primer producto y fusionar al iniciar sesión.
*/
const CARRITO_CERRADO = 51303;

export interface ResultadoCarrito {
    carrito: Record<string, unknown>;
    /** Token nuevo del invitado: el controlador lo deja en la cookie. */
    tokenNuevo?: string;
}

export async function obtener(comprador: Comprador): Promise<ResultadoCarrito> {
    return { carrito: await repositorio.obtener(propietarioODesconocido(comprador)) };
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
    return { carrito: await operacion(propietarioODesconocido(comprador)) };
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
