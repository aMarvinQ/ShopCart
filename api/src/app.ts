import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { Configuracion } from './config/configuracion.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/manejadorErrores.js';
import { registroPeticiones } from './middlewares/registroPeticiones.js';
import { rutasSistema } from './modules/sistema/sistema.routes.js';

export interface DependenciasApp {
    config: Configuracion;
    logger: Logger;
}

export function crearApp({ config, logger }: DependenciasApp): Express {
    const app = express();
    app.disable('x-powered-by');

    app.use(registroPeticiones(logger));
    app.use(helmet());
    // Solo los orígenes configurados (el frontend); credentials para las cookies de sesión.
    app.use(
        cors({
            origin: (origen, responder) => {
                responder(null, origen === undefined || config.CORS_ORIGENES.includes(origen));
            },
            credentials: true,
            exposedHeaders: ['X-Request-Id'],
        }),
    );
    app.use(express.json({ limit: '100kb' }));
    app.use(cookieParser());

    // Imágenes de productos: solo archivos (sin listado ni archivos ocultos), cargables desde el frontend.
    app.use(
        '/uploads',
        express.static(path.resolve(config.CARPETA_UPLOADS), {
            index: false,
            dotfiles: 'deny',
            maxAge: '1d',
            setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
        }),
    );

    const api = Router();
    api.use(rutasSistema);
    app.use('/api/v1', api);

    app.use(rutaNoEncontrada);
    app.use(manejadorErrores);
    return app;
}
