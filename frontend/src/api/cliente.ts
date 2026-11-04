import { renovarSesion } from '../sesion/renovacion';
import { avisarSesionTerminada, obtenerToken } from '../sesion/token';
import { ErrorApi, errorDeRespuesta, SESION_TERMINADA, SIN_CONEXION, TIEMPO_AGOTADO } from './errores';
import type { paths } from './esquema';

/*
    Único punto por el que el frontend habla con la API.
    - Tipado desde el OpenAPI: ruta, parámetros, cuerpo y respuesta los comprueba el compilador.
    - Todas las peticiones se pueden cancelar y tienen tiempo máximo.
    - Un token vencido se renueva una vez y la petición se repite. Repetirla es seguro aunque sea
      un pago: el 401 ocurre antes de ejecutar nada.
    - Nunca escribe en la consola el cuerpo de una petición (podría traer contraseñas o tarjetas).
*/
const BASE = '/api/v1';
const LIMITE_MS = 30_000;

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';
type RutaCompleta = keyof paths;
type Relativa<R> = R extends `${typeof BASE}${infer S}` ? S : never;

/** Rutas (sin /api/v1) que aceptan el método M. */
type RutasDe<M extends Metodo> = {
    [R in RutaCompleta]: paths[R][M] extends { responses: unknown } ? Relativa<R> : never;
}[RutaCompleta];

type Operacion<M extends Metodo, R extends string> = `${typeof BASE}${R}` extends RutaCompleta
    ? paths[`${typeof BASE}${R}`][M]
    : never;

/* Los parámetros opcionales del OpenAPI son propiedades opcionales: se conserva el tipo o `undefined`. */
type Parametros<O, K extends string> = O extends { parameters: infer Ps }
    ? K extends keyof Ps
        ? [Exclude<Ps[K], undefined>] extends [never]
            ? undefined
            : Ps[K]
        : undefined
    : undefined;
type Cuerpo<O> = O extends { requestBody?: { content: infer C } }
    ? C extends { 'application/json': infer J }
        ? J
        : C extends { 'multipart/form-data': unknown }
          ? FormData
          : undefined
    : undefined;

type ContenidoDe<R> = R extends { content: { 'application/json': infer J } } ? J : never;
type Exito<O> = O extends { responses: infer Res } ? ContenidoDe<Res[Extract<keyof Res, 200 | 201>]> : never;

/** Campo obligatorio si el dato lo es, opcional si puede faltar, ausente si no existe. */
type Campo<N extends string, T> = [T] extends [undefined]
    ? { [K in N]?: undefined }
    : undefined extends T
      ? { [K in N]?: T }
      : Record<string, never> extends T
        ? { [K in N]?: T }
        : { [K in N]: T };

export type OpcionesDe<O> = Campo<'params', Parametros<O, 'path'>> &
    Campo<'query', Parametros<O, 'query'>> &
    Campo<'cabeceras', Parametros<O, 'header'>> &
    Campo<'cuerpo', Cuerpo<O>> & { signal?: AbortSignal | undefined };

type Argumentos<O> = Record<string, never> extends OpcionesDe<O> ? [OpcionesDe<O>?] : [OpcionesDe<O>];

/** Tipo de los datos que devuelve una ruta: `DatosDe<'get', '/perfil'>`. */
export type RespuestaDe<M extends Metodo, R extends string> = Exito<Operacion<M, R>>;
export type DatosDe<M extends Metodo, R extends string> = RespuestaDe<M, R> extends { data: infer D } ? D : never;

interface OpcionesInternas {
    params?: object | undefined;
    query?: object | undefined;
    cabeceras?: object | undefined;
    cuerpo?: unknown;
    signal?: AbortSignal | undefined;
}

function construirUrl(ruta: string, { params, query }: OpcionesInternas): string {
    const conParams = ruta.replace(/\{(\w+)\}/g, (_, nombre: string) => {
        const valor = (params as Record<string, unknown> | undefined)?.[nombre];
        if (typeof valor !== 'string' && typeof valor !== 'number') {
            throw new Error(`Falta el parámetro ${nombre} de ${ruta}`);
        }
        return encodeURIComponent(valor);
    });
    const busqueda = new URLSearchParams();
    for (const [clave, valor] of Object.entries(query ?? {})) {
        if (valor === undefined || valor === null || valor === '') continue;
        busqueda.set(clave, String(valor as string | number | boolean));
    }
    const texto = busqueda.toString();
    return `${globalThis.location.origin}${BASE}${conParams}${texto ? `?${texto}` : ''}`;
}

/** Lanza ErrorApi también para fallas de red; una cancelación pedida por quien llama sigue como AbortError. */
async function enviar(url: string, init: RequestInit, signal: AbortSignal | undefined): Promise<Response> {
    const limite = AbortSignal.timeout(LIMITE_MS);
    try {
        return await fetch(url, { ...init, signal: signal ? AbortSignal.any([signal, limite]) : limite });
    } catch (error) {
        if (signal?.aborted) throw error;
        if (limite.aborted) {
            throw new ErrorApi(0, TIEMPO_AGOTADO, 'El servidor tardó demasiado en responder; intenta de nuevo.');
        }
        throw new ErrorApi(0, SIN_CONEXION, 'No hay conexión con el servidor; revisa tu internet.');
    }
}

function iniciar(metodo: Metodo, opciones: OpcionesInternas): RequestInit {
    const cabeceras = new Headers();
    for (const [clave, valor] of Object.entries(opciones.cabeceras ?? {})) {
        if (typeof valor === 'string') cabeceras.set(clave, valor);
    }
    const token = obtenerToken();
    if (token) cabeceras.set('Authorization', `Bearer ${token}`);
    const init: RequestInit = { method: metodo.toUpperCase(), credentials: 'include', headers: cabeceras };
    if (opciones.cuerpo instanceof FormData) {
        init.body = opciones.cuerpo; // el navegador pone el Content-Type con su separador
    } else if (opciones.cuerpo !== undefined) {
        cabeceras.set('Content-Type', 'application/json');
        init.body = JSON.stringify(opciones.cuerpo);
    }
    return init;
}

async function pedir(metodo: Metodo, ruta: string, opciones: OpcionesInternas = {}): Promise<Response> {
    const url = construirUrl(ruta, opciones);
    const tokenUsado = obtenerToken();
    const respuesta = await enviar(url, iniciar(metodo, opciones), opciones.signal);
    if (respuesta.ok) return respuesta;

    const error = await errorDeRespuesta(respuesta);
    if (error.codigo !== 'TOKEN_EXPIRADO') throw error;

    // Otra petición pudo renovar mientras esta iba en camino: entonces no hace falta otra rotación.
    if (obtenerToken() === tokenUsado) {
        const sesion = await renovarSesion();
        if (!sesion) {
            avisarSesionTerminada();
            throw new ErrorApi(401, SESION_TERMINADA, 'Tu sesión terminó; inicia sesión de nuevo.');
        }
    }
    // Una sola repetición: si vuelve a fallar, el error llega a quien llamó (sin ciclos).
    const repetida = await enviar(url, iniciar(metodo, opciones), opciones.signal);
    if (repetida.ok) return repetida;
    throw await errorDeRespuesta(repetida);
}

async function json<T>(metodo: Metodo, ruta: string, opciones?: OpcionesInternas): Promise<T> {
    const respuesta = await pedir(metodo, ruta, opciones);
    if (respuesta.status === 204) return undefined as T;
    return (await respuesta.json()) as T;
}

export const api = {
    get: <R extends RutasDe<'get'>>(ruta: R, ...[o]: Argumentos<Operacion<'get', R>>) =>
        json<Exito<Operacion<'get', R>>>('get', ruta, o),
    post: <R extends RutasDe<'post'>>(ruta: R, ...[o]: Argumentos<Operacion<'post', R>>) =>
        json<Exito<Operacion<'post', R>>>('post', ruta, o),
    put: <R extends RutasDe<'put'>>(ruta: R, ...[o]: Argumentos<Operacion<'put', R>>) =>
        json<Exito<Operacion<'put', R>>>('put', ruta, o),
    patch: <R extends RutasDe<'patch'>>(ruta: R, ...[o]: Argumentos<Operacion<'patch', R>>) =>
        json<Exito<Operacion<'patch', R>>>('patch', ruta, o),
    delete: <R extends RutasDe<'delete'>>(ruta: R, ...[o]: Argumentos<Operacion<'delete', R>>) =>
        json<Exito<Operacion<'delete', R>>>('delete', ruta, o),

    /** Descarga de archivos (exportaciones): devuelve el contenido y el nombre sugerido por la API. */
    async descargar<R extends RutasDe<'get'>>(
        ruta: R,
        ...[o]: Argumentos<Operacion<'get', R>>
    ): Promise<{ archivo: Blob; nombre: string }> {
        const respuesta = await pedir('get', ruta, o);
        const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
        return {
            archivo: await respuesta.blob(),
            nombre: /filename="([^"]+)"/.exec(disposicion)?.[1] ?? 'descarga',
        };
    },
};
