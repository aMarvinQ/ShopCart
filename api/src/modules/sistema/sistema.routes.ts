import { Router } from 'express';
import * as controlador from './sistema.controller.js';

export const rutasSistema = Router();

/** Público: lo usan el monitoreo y el despliegue para saber si la API y la base responden. */
rutasSistema.get('/health', controlador.salud);
