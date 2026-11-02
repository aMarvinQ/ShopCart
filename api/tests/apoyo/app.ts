import type { Express } from 'express';
import { crearApp } from '../../src/app.js';
import { cargarConfiguracion } from '../../src/config/configuracion.js';
import { cerrarConexion, configurarConexion } from '../../src/db/index.js';
import { crearLogger } from '../../src/logger.js';

/** App completa conectada a la base de pruebas, sin abrir un puerto (supertest la invoca directo). */
export function crearAppPrueba(): Express {
    const config = cargarConfiguracion();
    configurarConexion(config);
    return crearApp({ config, logger: crearLogger(config) });
}

export { cerrarConexion };
