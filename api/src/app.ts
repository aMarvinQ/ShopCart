import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';
import type { Configuracion } from './config/configuracion.js';
import { generarDocumento } from './docs/openapi.js';
import { EventosNegocio } from './eventos/eventosNegocio.js';
import type { DependenciasRutas } from './http/dependencias.js';
import { crearAutenticacion } from './middlewares/autenticacion.js';
import { crearLimitesIntentos } from './middlewares/limiteIntentos.js';
import { manejadorErrores, rutaNoEncontrada } from './middlewares/manejadorErrores.js';
import { registroPeticiones } from './middlewares/registroPeticiones.js';
import { crearRutasAuth } from './modules/auth/auth.routes.js';
import { crearRutasBitacora } from './modules/bitacora/bitacora.routes.js';
import { crearRutasCarrito } from './modules/carrito/carrito.routes.js';
import { crearRutasCatalogo } from './modules/catalogo/catalogo.routes.js';
import { crearRutasCheckout } from './modules/checkout/checkout.routes.js';
import { crearRutasCupones } from './modules/cupones/cupones.routes.js';
import { crearRutasDirecciones } from './modules/direcciones/direcciones.routes.js';
import { crearRutasEnvios } from './modules/envios/envios.routes.js';
import { crearRutasInventario } from './modules/inventario/inventario.routes.js';
import { crearRutasParametros } from './modules/parametros/parametros.routes.js';
import { crearRutasPedidos } from './modules/pedidos/pedidos.routes.js';
import { crearRutasReportes, type ModuloReportes } from './modules/reportes/reportes.routes.js';
import type { OpcionesTiempoReal } from './modules/reportes/tiempoReal.js';
import { rutasSistema } from './modules/sistema/sistema.routes.js';
import { crearRutasTienda } from './modules/tienda/tienda.routes.js';
import { crearRutasUsuarios } from './modules/usuarios/usuarios.routes.js';
import { PasarelaSimulada, type PasarelaPagos } from './pagos/pasarela.js';
import { ClavesCheckout } from './seguridad/clavesCheckout.js';
import { Tokens } from './seguridad/tokens.js';

export interface DependenciasApp {
    config: Configuracion;
    logger: Logger;
    /** Pasarela de pagos; por defecto la simulada (las pruebas pasan la suya para revisar los cobros). */
    pasarela?: PasarelaPagos;
    /** Tiempos del dashboard en tiempo real (las pruebas los acortan). */
    tiempoReal?: OpcionesTiempoReal;
}

/** Lo que la app expone en app.locals para el cierre ordenado y el diagnóstico. */
export interface ServiciosApp {
    eventos: EventosNegocio;
    reportes: ModuloReportes;
    /** Cierra lo que mantiene conexiones abiertas (SSE); el servidor lo llama al detenerse. */
    cerrar: () => void;
}

/* Rutas cuyas modificaciones cambian los reportes (las ventas se avisan desde el pago). */
const RUTAS_QUE_AFECTAN_REPORTES =
    /^\/(productos|variantes|categorias|inventario|pedidos|mis-pedidos|parametros)(?:\/|$)/;

export function crearApp({ config, logger, pasarela = new PasarelaSimulada(), tiempoReal }: DependenciasApp): Express {
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
    const eventos = new EventosNegocio();
    const tareasCierre: (() => void)[] = [];
    const dependencias: DependenciasRutas = {
        config,
        logger,
        tokens,
        autenticacion: crearAutenticacion(tokens),
        limites: crearLimitesIntentos(config),
        pasarela,
        claves: new ClavesCheckout(config.JWT_SECRETO),
        eventos,
        alCerrar: (tarea) => tareasCierre.push(tarea),
    };

    const api = Router();
    api.use(eventos.avisarCambios(RUTAS_QUE_AFECTAN_REPORTES));
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
    api.use(crearRutasCheckout(dependencias));
    api.use(crearRutasPedidos(dependencias));
    const reportes = crearRutasReportes(dependencias, tiempoReal);
    api.use(reportes.rutas);
    api.use(crearRutasBitacora(dependencias));
    api.use(crearRutasParametros(dependencias));

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

    const servicios: ServiciosApp = {
        eventos,
        reportes,
        cerrar: () => {
            for (const tarea of tareasCierre) tarea();
        },
    };
    app.locals.servicios = servicios;

    app.use('/api/v1', api);
    app.use(rutaNoEncontrada);
    app.use(manejadorErrores);
    return app;
}
