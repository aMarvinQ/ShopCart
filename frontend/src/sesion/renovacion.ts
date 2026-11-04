import type { components } from '../api/esquema';
import { ErrorApi, errorDeRespuesta, SIN_CONEXION, TIEMPO_AGOTADO } from '../api/errores';
import { fijarToken, marcarSesion } from './token';

export type Sesion = components['schemas']['Sesion'];
export type UsuarioSesion = Sesion['usuario'];

/*
    Renovación del access token con el refresh token de la cookie.

    - Vuelo único: si varias peticiones vencen a la vez, se hace UNA renovación y todas la esperan.
      Cada renovación rota el refresh token; dos en paralelo chocarían (ROTACION_CONCURRENTE).
    - Entre pestañas: un bloqueo del navegador (Web Locks) las pone en fila, así cada una usa la
      cookie ya rotada por la anterior.
    - Devuelve null solo si la sesión terminó de verdad (la API la rechazó). Una falla pasajera
      (sin red, 503) lanza un error y NO cierra la sesión: se puede reintentar.
*/
const RUTA = '/api/v1/auth/refresh';
const BLOQUEO = 'shopcart-renovacion';
const LIMITE_MS = 15_000;
const ESPERA_ROTACION_MS = 400;

const origen = () => globalThis.location.origin;

async function pedir(): Promise<Response> {
    try {
        return await fetch(`${origen()}${RUTA}`, {
            method: 'POST',
            credentials: 'include',
            signal: AbortSignal.timeout(LIMITE_MS),
        });
    } catch (error) {
        const agotado = error instanceof DOMException && error.name === 'TimeoutError';
        throw new ErrorApi(
            0,
            agotado ? TIEMPO_AGOTADO : SIN_CONEXION,
            agotado ? 'El servidor tardó demasiado en responder.' : 'No hay conexión con el servidor.',
        );
    }
}

async function renovar(reintento = false): Promise<Sesion | null> {
    const respuesta = await pedir();
    if (respuesta.ok) {
        const { data } = (await respuesta.json()) as { data: Sesion };
        fijarToken(data.accessToken);
        marcarSesion(true);
        return data;
    }
    const error = await errorDeRespuesta(respuesta);
    if (respuesta.status !== 401) throw error; // 429 o 5xx: pasajero, la sesión sigue
    // Otra petición con la misma cookie (otra pestaña) acaba de rotar: se reintenta con la nueva.
    if (error.codigo === 'ROTACION_CONCURRENTE' && !reintento) {
        await new Promise((resolver) => setTimeout(resolver, ESPERA_ROTACION_MS));
        return renovar(true);
    }
    fijarToken(null);
    marcarSesion(false);
    return null;
}

const conBloqueo = <T>(tarea: () => Promise<T>): Promise<T> =>
    'locks' in navigator ? navigator.locks.request(BLOQUEO, tarea) : tarea();

let enCurso: Promise<Sesion | null> | null = null;

export function renovarSesion(): Promise<Sesion | null> {
    enCurso ??= conBloqueo(() => renovar()).finally(() => {
        enCurso = null;
    });
    return enCurso;
}
