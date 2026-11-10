import type { z } from '../../config/zod.js';
import { ErrorApi } from '../../errors/ErrorApi.js';
import { hashearContrasena } from '../../seguridad/contrasenas.js';
import * as repositorio from './usuarios.repository.js';
import type {
    esquemaActualizarInterno,
    esquemaActualizarPerfil,
    esquemaCrearInterno,
    esquemaListarUsuarios,
} from './usuarios.schemas.js';

/* Las reglas (permisos, validaciones, bitácora) viven en los SPs; aquí solo el hash de la contraseña. */

function existente<T>(fila: T | undefined): T {
    if (fila === undefined)
        throw new ErrorApi(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe o está desactivado.');
    return fila;
}

export async function obtenerPerfil(idUsuario: number) {
    return existente(await repositorio.obtenerPerfil(idUsuario));
}

export async function actualizarPerfil(idUsuario: number, datos: z.infer<typeof esquemaActualizarPerfil>) {
    return existente(await repositorio.actualizarPerfil(idUsuario, datos));
}

export async function crearInterno(idAdmin: number, datos: z.infer<typeof esquemaCrearInterno>) {
    return existente(await repositorio.crearInterno(idAdmin, datos, await hashearContrasena(datos.contrasena)));
}

export async function actualizarInterno(
    idAdmin: number,
    idUsuario: number,
    datos: z.infer<typeof esquemaActualizarInterno>,
) {
    return existente(await repositorio.actualizarInterno(idAdmin, idUsuario, datos));
}

export async function cambiarEstado(idAdmin: number, idUsuario: number, activo: boolean) {
    return existente(await repositorio.cambiarEstado(idAdmin, idUsuario, activo));
}

export function listar(idAdmin: number, filtros: z.infer<typeof esquemaListarUsuarios>) {
    return repositorio.listar(idAdmin, filtros);
}
