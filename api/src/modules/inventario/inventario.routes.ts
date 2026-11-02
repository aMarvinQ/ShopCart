import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import * as controlador from './inventario.controller.js';
import {
    esquemaConciliacion,
    esquemaExistencia,
    esquemaExistencias,
    esquemaKardex,
    esquemaMovimiento,
    esquemaMovimientoKardex,
    esquemaMovimientoRegistrado,
} from './inventario.schemas.js';

const ETIQUETA = 'Inventario';
const ROLES = ['OPERADOR', 'ADMIN'];

documentar({
    metodo: 'get',
    ruta: '/inventario/existencias',
    etiqueta: ETIQUETA,
    resumen: 'Existencias por variante',
    descripcion: 'Física, reservada por checkouts en curso y disponible para vender.',
    roles: ROLES,
    query: esquemaExistencias,
    respuesta: z.array(esquemaExistencia),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/inventario/kardex',
    etiqueta: ETIQUETA,
    resumen: 'Kardex (movimientos de inventario)',
    descripcion: 'Del más reciente al más antiguo, con el saldo antes y después de cada movimiento.',
    roles: ROLES,
    query: esquemaKardex,
    respuesta: z.array(esquemaMovimientoKardex),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'post',
    ruta: '/inventario/movimientos',
    etiqueta: ETIQUETA,
    resumen: 'Registrar una entrada o un ajuste',
    descripcion:
        'Varias variantes en una sola transacción (p. ej. una compra). Las cantidades van positivas; el tipo pone el signo. ' +
        'Una salida solo toma unidades disponibles: no toca las reservadas por quien está pagando (409 STOCK_INSUFICIENTE).',
    roles: ROLES,
    cuerpo: esquemaMovimiento,
    respuesta: z.array(esquemaMovimientoRegistrado),
    estado: 201,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'get',
    ruta: '/inventario/conciliacion',
    etiqueta: ETIQUETA,
    resumen: 'Conciliación del kardex',
    descripcion:
        'Variantes cuya existencia no cuadra con la suma del kardex o con saltos de saldo. Lista vacía = todo cuadra.',
    roles: ROLES,
    respuesta: z.array(esquemaConciliacion),
});

export function crearRutasInventario({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    const personal = [autenticar, autorizar('OPERADOR', 'ADMIN')];
    rutas.get('/inventario/existencias', ...personal, controlador.listarExistencias);
    rutas.get('/inventario/kardex', ...personal, controlador.listarKardex);
    rutas.post('/inventario/movimientos', ...personal, controlador.registrarMovimiento);
    rutas.get('/inventario/conciliacion', ...personal, controlador.conciliar);
    return rutas;
}
