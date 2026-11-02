import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import * as controlador from './sistema.controller.js';

documentar({
    metodo: 'get',
    ruta: '/health',
    etiqueta: 'Sistema',
    resumen: 'Estado de la API y de la base de datos',
    descripcion: 'Responde 503 (BASE_DATOS_NO_DISPONIBLE) si la base no responde.',
    respuesta: z.object({
        estado: z.literal('ok'),
        baseDatos: z.object({
            scriptsAplicados: z.number(),
            ultimoScript: z.string().nullable(),
            fechaUltimoScript: z.string().nullable(),
        }),
        fechaServidor: z.string(),
    }),
});

export const rutasSistema = Router();

/** Público: lo usan el monitoreo y el despliegue para saber si la API y la base responden. */
rutasSistema.get('/health', controlador.salud);
