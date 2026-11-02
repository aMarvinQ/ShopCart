import { existsSync } from 'node:fs';
import { crearApp } from './app.js';
import { cargarConfiguracion, ConfiguracionInvalidaError } from './config/configuracion.js';
import { cerrarConexion, configurarConexion } from './db/index.js';
import { programarExpiracionCheckouts } from './jobs/expirarCheckouts.js';
import { programarLimpiezaImagenes } from './jobs/limpiarImagenes.js';
import { crearLogger } from './logger.js';
import { AlmacenImagenes } from './storage/almacenImagenes.js';

// Variables de entorno: las del sistema tienen prioridad sobre las de .env.
if (existsSync('.env')) process.loadEnvFile('.env');

let config;
try {
    config = cargarConfiguracion();
} catch (error) {
    if (error instanceof ConfiguracionInvalidaError) {
        console.error(error.message);
        process.exit(1);
    }
    throw error;
}

const logger = crearLogger(config);
configurarConexion(config);
const app = crearApp({ config, logger });

const servidor = app.listen(config.PUERTO, () => {
    logger.info(`API escuchando en http://localhost:${config.PUERTO} (base ${config.DB_NOMBRE})`);
});

// Procesos periódicos (solo en el servidor; las pruebas los ejecutan directamente).
const expiracion = programarExpiracionCheckouts(logger);
const tareas = [expiracion, programarLimpiezaImagenes(new AlmacenImagenes(config.CARPETA_UPLOADS), logger)];
// Al arrancar se ponen al día los checkouts que vencieron mientras la API estaba detenida.
void expiracion.ejecutar();

// Cierre ordenado: deja de aceptar peticiones, termina las que están en curso (y las tareas
// periódicas) y cierra el pool.
let cerrando = false;
function cerrar(senal: string): void {
    if (cerrando) return;
    cerrando = true;
    logger.info(`${senal} recibido: cerrando la API`);
    setTimeout(() => {
        logger.error('El cierre tardó demasiado: se fuerza la salida');
        process.exit(1);
    }, 10_000).unref();
    servidor.close(() => {
        Promise.all(tareas.map((t) => t.detener()))
            .then(() => cerrarConexion())
            .then(
                () => process.exit(0),
                (error: unknown) => {
                    logger.error({ err: error }, 'Error al cerrar la conexión');
                    process.exit(1);
                },
            );
    });
}
process.on('SIGINT', () => {
    cerrar('SIGINT');
});
process.on('SIGTERM', () => {
    cerrar('SIGTERM');
});
