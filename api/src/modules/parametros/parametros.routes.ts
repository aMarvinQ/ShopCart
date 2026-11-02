import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import * as controlador from './parametros.controller.js';
import { esquemaActualizarParametro, esquemaClave, esquemaParametro } from './parametros.schemas.js';

const ETIQUETA = 'Parámetros';
const ROLES = ['ADMIN'];

documentar({
    metodo: 'get',
    ruta: '/parametros',
    etiqueta: ETIQUETA,
    resumen: 'Listar los parámetros del sistema',
    descripcion: 'Valor, tipo, descripción y rango permitido de cada uno.',
    roles: ROLES,
    respuesta: z.array(esquemaParametro),
});
documentar({
    metodo: 'get',
    ruta: '/parametros/{clave}',
    etiqueta: ETIQUETA,
    resumen: 'Ver un parámetro (con su versionFila)',
    roles: ROLES,
    params: esquemaClave,
    respuesta: esquemaParametro,
    errores: [400, 404],
});
documentar({
    metodo: 'put',
    ruta: '/parametros/{clave}',
    etiqueta: ETIQUETA,
    resumen: 'Cambiar el valor de un parámetro',
    descripcion:
        'Aplica de inmediato. Fuera de rango o de otro tipo: 422 VALOR_PARAMETRO_INVALIDO. La vigencia máxima de la ' +
        'sesión no puede ser menor que su inactividad (409). Envía la versionFila de la última lectura (409 ' +
        'EDICION_CONCURRENTE). Guardar el mismo valor no es error ni deja registro. Queda en la bitácora y vacía el ' +
        'caché de reportes.',
    roles: ROLES,
    params: esquemaClave,
    cuerpo: esquemaActualizarParametro,
    respuesta: esquemaParametro,
    errores: [400, 404, 409, 422],
});

export function crearRutasParametros({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    const admin = [autenticar, autorizar('ADMIN')];
    rutas.get('/parametros', ...admin, controlador.listar);
    rutas.get('/parametros/:clave', ...admin, controlador.obtener);
    rutas.put('/parametros/:clave', ...admin, controlador.actualizar);
    return rutas;
}
