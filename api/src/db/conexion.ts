import sql from 'mssql';
import type { Configuracion } from '../config/configuracion.js';

/*
    Pool de conexiones único de la API, conectado como shopcart_api: ese usuario solo puede
    ejecutar SPs (RolApi), así que aun con un error en la API no hay acceso directo a tablas.
    Se conecta en la primera petición; si la base no está disponible, la siguiente vuelve a
    intentarlo (la API arranca aunque la base tarde en levantar).
*/
let pool: sql.ConnectionPool | null = null;
let conectando: Promise<sql.ConnectionPool> | null = null;

export function configurarConexion(config: Configuracion): void {
    pool = new sql.ConnectionPool({
        server: config.DB_SERVIDOR,
        port: config.DB_PUERTO,
        database: config.DB_NOMBRE,
        user: config.DB_USUARIO,
        password: config.DB_CONTRASENA,
        options: {
            encrypt: true,
            trustServerCertificate: config.DB_CONFIAR_CERTIFICADO,
            appName: 'ShopCart.Api',
        },
        pool: { max: 10, min: 0, idleTimeoutMillis: 30_000 },
        connectionTimeout: 15_000,
        requestTimeout: 30_000,
    });
    conectando = null;
}

export async function obtenerPool(): Promise<sql.ConnectionPool> {
    if (!pool) throw new Error('La conexión a la base de datos no está configurada.');
    if (pool.connected) return pool;
    conectando ??= pool.connect().catch((error: unknown) => {
        conectando = null;
        throw error;
    });
    return conectando;
}

export async function cerrarConexion(): Promise<void> {
    const actual = pool;
    pool = null;
    conectando = null;
    if (actual?.connected) await actual.close();
}
