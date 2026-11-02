import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { Configuracion } from './config/configuracion.js';
import { generarDocumento } from './docs/openapi.js';
import type { DependenciasRutas } from './http/dependencias.js';
import { crearAutenticacion } from './middlewares/autenticacion.js';
import { crearLimitesIntentos } from './middlewares/limiteIntentos.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/manejadorErrores.js';
import { registroPeticiones } from './middlewares/registroPeticiones.js';
import { crearRutasAuth } from './modules/auth/auth.routes.js';
import { crearRutasCarrito } from './modules/carrito/carrito.routes.js';
import { crearRutasCatalogo } from './modules/catalogo/catalogo.routes.js';
import { crearRutasCupones } from './modules/cupones/cupones.routes.js';
import { crearRutasDirecciones } from './modules/direcciones/direcciones.routes.js';
import { crearRutasEnvios } from './modules/envios/envios.routes.js';
import { crearRutasInventario } from './modules/inventario/inventario.routes.js';
import { rutasSistema } from './modules/sistema/sistema.routes.js';
import { crearRutasTienda } from './modules/tienda/tienda.routes.js';
import { crearRutasUsuarios } from './modules/usuarios/usuarios.routes.js';
import { Tokens } from './seguridad/tokens.js';

export interface DependenciasApp {
    config: Configuracion;
    logger: Logger;
}

export function crearApp({ config, logger }: DependenciasApp): Express {
    const app = express();
    app.disable('x-powered-by');

    app.use(registroPeticiones(logger));
    app.use(helmet());
    // Solo los orígenes configurados (el frontend); credentials para la cookie de sesión.
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

    // Dependencias por app (no globales): cada prueba crea la suya con su configuración.
    const tokens = new Tokens(config.JWT_SECRETO, config.JWT_ACCESO_MINUTOS);
    const dependencias: DependenciasRutas = {
        config,
        tokens,
        autenticacion: crearAutenticacion(tokens),
        limites: crearLimitesIntentos(config),
    };

    const api = Router();
    api.use(rutasSistema);
    api.use(crearRutasAuth(dependencias));
    api.use(crearRutasUsuarios(dependencias));
    api.use(crearRutasDirecciones(dependencias));
    api.use(crearRutasEnvios(dependencias));
    api.use(crearRutasTienda());
    api.use(crearRutasCatalogo(dependencias));
    api.use(crearRutasInventario(dependencias));
    api.use(crearRutasCarrito(dependencias));
    api.use(crearRutasCupones(dependencias));

    if (config.DOCS_ACTIVAS) {
        const documento = generarDocumento();
        api.get('/docs/openapi.json', (_req, res) => {
            res.json(documento);
        });
        api.use(
            '/docs',
            swaggerUi.serve,
            swaggerUi.setup(documento, {
                customSiteTitle: 'ShopCart API',
                swaggerOptions: { persistAuthorization: true, withCredentials: true, displayRequestDuration: true },
            }),
        );
    }

    app.use('/api/v1', api);
    app.use(rutaNoEncontrada);
    app.use(manejadorErrores);
    return app;
}
