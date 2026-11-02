import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { crearApp } from '../../src/app.js';
import { cargarConfiguracion, type Configuracion } from '../../src/config/configuracion.js';
import { cerrarConexion, configurarConexion } from '../../src/db/index.js';
import { crearLogger } from '../../src/logger.js';

/** App completa conectada a la base de pruebas, sin abrir un puerto (supertest la invoca directo). */
export function crearAppPrueba(cambios: Partial<Configuracion> = {}): Express {
    const config = { ...cargarConfiguracion(), ...cambios };
    configurarConexion(config);
    return crearApp({ config, logger: crearLogger(config) });
}

export { cerrarConexion };

/* Credenciales de la semilla de demostración (presentes en la base de pruebas). */
export const ADMIN = { correo: 'admin@shopcart.test', contrasena: 'Admin#2026' };
export const OPERADOR = { correo: 'operador@shopcart.test', contrasena: 'Operador#2026' };

export const correoUnico = (prefijo = 'prueba'): string => `${prefijo}.${randomUUID().slice(0, 8)}@prueba.test`;

export interface SesionPrueba {
    token: string;
    cookie: string;
    idUsuario: number;
}

function cookieDe(respuesta: request.Response): string {
    const cookies = respuesta.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = cookies?.find((c) => c.startsWith('shopcart_refresh='));
    if (!cookie) throw new Error('La respuesta no trae la cookie del refresh token.');
    return cookie.split(';')[0] ?? '';
}

export function sesionDe(respuesta: request.Response): SesionPrueba {
    const data = (respuesta.body as { data: { accessToken: string; usuario: { idUsuario: number } } }).data;
    return { token: data.accessToken, cookie: cookieDe(respuesta), idUsuario: data.usuario.idUsuario };
}

export async function registrarCliente(
    app: Express,
    correo = correoUnico(),
): Promise<SesionPrueba & { correo: string }> {
    const respuesta = await request(app)
        .post('/api/v1/auth/registro')
        .send({ correo, contrasena: 'Prueba2026', nombre: 'Cliente', apellido: 'Prueba' })
        .expect(201);
    return { ...sesionDe(respuesta), correo };
}

export async function iniciarSesion(app: Express, correo: string, contrasena: string): Promise<SesionPrueba> {
    return sesionDe(await request(app).post('/api/v1/auth/login').send({ correo, contrasena }).expect(200));
}

/** Código de error de una respuesta { error: { codigo } }. */
export const codigoError = (respuesta: request.Response): string =>
    (respuesta.body as { error: { codigo: string } }).error.codigo;

/** Datos de una respuesta { data }. */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- el tipo lo indica cada prueba
export const datos = <T = Record<string, unknown>>(respuesta: request.Response): T =>
    (respuesta.body as { data: T }).data;

export const sufijo = (): string => randomUUID().slice(0, 8);
