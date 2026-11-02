import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { esquemaId } from '../../http/esquemas.js';
import * as controlador from './pedidos.controller.js';
import {
    esquemaCambiarEstado,
    esquemaCancelarCliente,
    esquemaCancelarPanel,
    esquemaDevolucion,
    esquemaListarDevoluciones,
    esquemaListarPedidos,
    esquemaMisPedidos,
    esquemaPedidoCliente,
    esquemaPedidoPanel,
    esquemaRegistrarDevolucion,
    esquemaResumenPedido,
    esquemaTokenSeguimiento,
} from './pedidos.schemas.js';

const CLIENTE = ['CLIENTE'];
const PERSONAL = ['OPERADOR', 'ADMIN'];

/* === Cliente ============================================================================== */

documentar({
    metodo: 'get',
    ruta: '/mis-pedidos',
    etiqueta: 'Mis pedidos',
    resumen: 'Mis pedidos, del más reciente al más antiguo',
    roles: CLIENTE,
    query: esquemaMisPedidos,
    respuesta: z.array(esquemaResumenPedido),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/mis-pedidos/{id}',
    etiqueta: 'Mis pedidos',
    resumen: 'Detalle de un pedido propio',
    descripcion: 'Líneas, historial de estados, pagos (marca y últimos 4) y devoluciones. Uno ajeno responde 404.',
    roles: CLIENTE,
    params: esquemaId,
    respuesta: esquemaPedidoCliente,
    errores: [404],
});
documentar({
    metodo: 'post',
    ruta: '/mis-pedidos/{id}/cancelar',
    etiqueta: 'Mis pedidos',
    resumen: 'Cancelar un pedido propio',
    descripcion:
        'Solo mientras está PAGADO (aún no se prepara): devuelve la existencia, revierte el uso del cupón y ' +
        'registra el reembolso. Después responde 409 TRANSICION_NO_PERMITIDA (contactar a la tienda). El motivo es opcional.',
    roles: CLIENTE,
    params: esquemaId,
    cuerpo: esquemaCancelarCliente,
    respuesta: esquemaPedidoCliente,
    errores: [400, 404, 409],
});

/* === Seguimiento ========================================================================== */

documentar({
    metodo: 'get',
    ruta: '/seguimiento/{token}',
    etiqueta: 'Seguimiento',
    resumen: 'Seguir un pedido con el enlace secreto (sin sesión)',
    descripcion:
        'El token se entrega al pagar (tokenSeguimiento). No se busca por número de pedido porque es secuencial y ' +
        'adivinable. Un token desconocido o mal formado responde 404.',
    params: esquemaTokenSeguimiento,
    respuesta: esquemaPedidoCliente,
    errores: [404],
});

/* === Panel ================================================================================ */

documentar({
    metodo: 'get',
    ruta: '/pedidos',
    etiqueta: 'Pedidos (panel)',
    resumen: 'Listar pedidos',
    descripcion: 'Del más reciente al más antiguo, con filtros por estado, rango de fechas y búsqueda.',
    roles: PERSONAL,
    query: esquemaListarPedidos,
    respuesta: z.array(esquemaResumenPedido),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/pedidos/{id}',
    etiqueta: 'Pedidos (panel)',
    resumen: 'Detalle de un pedido',
    descripcion: 'Incluye quién hizo cada cambio de estado, todos los intentos de pago y las devoluciones.',
    roles: PERSONAL,
    params: esquemaId,
    respuesta: esquemaPedidoPanel,
    errores: [404],
});
documentar({
    metodo: 'patch',
    ruta: '/pedidos/{id}/estado',
    etiqueta: 'Pedidos (panel)',
    resumen: 'Avanzar el estado de un pedido',
    descripcion:
        'Solo por las transiciones permitidas (409 TRANSICION_NO_PERMITIDA). Queda en el historial con el comentario ' +
        'y en la bitácora.',
    roles: PERSONAL,
    params: esquemaId,
    cuerpo: esquemaCambiarEstado,
    respuesta: esquemaPedidoPanel,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'post',
    ruta: '/pedidos/{id}/cancelar',
    etiqueta: 'Pedidos (panel)',
    resumen: 'Cancelar un pedido',
    descripcion:
        'PAGADO o EN_PREPARACION, con motivo obligatorio. En una transacción devuelve la existencia (kardex ' +
        'CANCELACION), revierte el uso del cupón y registra el reembolso del pago.',
    roles: PERSONAL,
    params: esquemaId,
    cuerpo: esquemaCancelarPanel,
    respuesta: esquemaPedidoPanel,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'post',
    ruta: '/pedidos/{id}/devoluciones',
    etiqueta: 'Devoluciones',
    resumen: 'Registrar una devolución total o parcial',
    descripcion:
        'Pedidos ENTREGADO o DEVUELTO_PARCIAL, dentro de DIAS_DEVOLUCION desde la entrega. Por línea: cuántas ' +
        'unidades y si reingresan al inventario (kardex DEVOLUCION). Reembolso proporcional a lo pagado por la línea; ' +
        'el envío no se reembolsa. El pedido pasa a DEVUELTO_PARCIAL o DEVUELTO.',
    roles: PERSONAL,
    params: esquemaId,
    cuerpo: esquemaRegistrarDevolucion,
    respuesta: esquemaPedidoPanel,
    estado: 201,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'get',
    ruta: '/devoluciones',
    etiqueta: 'Devoluciones',
    resumen: 'Listar devoluciones',
    roles: PERSONAL,
    query: esquemaListarDevoluciones,
    respuesta: z.array(esquemaDevolucion),
    conMeta: true,
    errores: [400, 422],
});

export function crearRutasPedidos({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    const cliente = [autenticar, autorizar('CLIENTE')];
    const personal = [autenticar, autorizar('OPERADOR', 'ADMIN')];

    rutas.get('/mis-pedidos', ...cliente, controlador.misPedidos);
    rutas.get('/mis-pedidos/:id', ...cliente, controlador.miPedido);
    rutas.post('/mis-pedidos/:id/cancelar', ...cliente, controlador.cancelarMiPedido);

    rutas.get('/seguimiento/:token', controlador.seguimiento);

    rutas.get('/pedidos', ...personal, controlador.listar);
    rutas.get('/pedidos/:id', ...personal, controlador.obtener);
    rutas.patch('/pedidos/:id/estado', ...personal, controlador.cambiarEstado);
    rutas.post('/pedidos/:id/cancelar', ...personal, controlador.cancelar);
    rutas.post('/pedidos/:id/devoluciones', ...personal, controlador.registrarDevolucion);
    rutas.get('/devoluciones', ...personal, controlador.listarDevoluciones);
    return rutas;
}
