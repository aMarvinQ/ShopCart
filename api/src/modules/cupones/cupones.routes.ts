import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { esquemaId } from '../../http/esquemas.js';
import { esquemaEstado } from '../catalogo/catalogo.schemas.js';
import * as controlador from './cupones.controller.js';
import { esquemaActualizarCupon, esquemaCupon, esquemaDatosCupon, esquemaListarCupones } from './cupones.schemas.js';

const ETIQUETA = 'Cupones';
const ROLES = ['ADMIN'];

documentar({
    metodo: 'get',
    ruta: '/cupones',
    etiqueta: ETIQUETA,
    resumen: 'Listar cupones',
    descripcion: 'Situación calculada al consultar: VIGENTE, PROGRAMADO, VENCIDO, AGOTADO o INACTIVO.',
    roles: ROLES,
    query: esquemaListarCupones,
    respuesta: z.array(esquemaCupon),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/cupones/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Ver un cupón (con usos, monto descontado y versionFila)',
    roles: ROLES,
    params: esquemaId,
    respuesta: esquemaCupon,
    errores: [404],
});
documentar({
    metodo: 'post',
    ruta: '/cupones',
    etiqueta: ETIQUETA,
    resumen: 'Crear un cupón',
    descripcion:
        'Porcentaje o monto fijo, vigencia, monto mínimo, límites de uso total y por cliente, categoría y solo registrados.',
    roles: ROLES,
    cuerpo: esquemaDatosCupon,
    respuesta: esquemaCupon,
    estado: 201,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'put',
    ruta: '/cupones/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Editar un cupón',
    descripcion:
        'Después del primer uso no se pueden cambiar su código, tipo, valor ni categoría (409 CUPON_CON_USOS); sí su ' +
        'vigencia, límites y descripción. Envía la versionFila de la última lectura (409 EDICION_CONCURRENTE).',
    roles: ROLES,
    params: esquemaId,
    cuerpo: esquemaActualizarCupon,
    respuesta: esquemaCupon,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'patch',
    ruta: '/cupones/{id}/estado',
    etiqueta: ETIQUETA,
    resumen: 'Activar o desactivar un cupón',
    roles: ROLES,
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaCupon,
    errores: [400, 404],
});

export function crearRutasCupones({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    const admin = [autenticar, autorizar('ADMIN')];
    rutas.get('/cupones', ...admin, controlador.listar);
    rutas.get('/cupones/:id', ...admin, controlador.obtener);
    rutas.post('/cupones', ...admin, controlador.crear);
    rutas.put('/cupones/:id', ...admin, controlador.actualizar);
    rutas.patch('/cupones/:id/estado', ...admin, controlador.cambiarEstado);
    return rutas;
}
