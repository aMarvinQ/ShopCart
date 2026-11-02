import type { Configuracion } from '../config/configuracion.js';
import type { Autenticacion } from '../middlewares/autenticacion.js';
import type { LimitesIntentos } from '../middlewares/limiteIntentos.js';
import type { Tokens } from '../seguridad/tokens.js';

/** Lo que reciben las rutas de cada módulo al armar la app (una instancia por app: las pruebas crean la suya). */
export interface DependenciasRutas {
    config: Configuracion;
    tokens: Tokens;
    autenticacion: Autenticacion;
    limites: LimitesIntentos;
}
