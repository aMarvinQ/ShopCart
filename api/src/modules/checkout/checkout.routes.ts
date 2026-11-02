import { Router } from 'express';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { esquemaId } from '../../http/esquemas.js';
import { crearControladorCheckout } from './checkout.controller.js';
import {
    esquemaCabeceraIdempotencia,
    esquemaCheckout,
    esquemaIniciarCheckout,
    esquemaPagar,
    esquemaPagoRealizado,
} from './checkout.schemas.js';
import { crearServicioCheckout } from './checkout.service.js';

/*
    Checkout del cliente (access token) o del invitado (cookie del carrito). Para probar como
    invitado en Swagger: agrega productos sin Authorize; la cookie viaja sola.
*/
const ETIQUETA = 'Checkout y pago';
const NOTA_COMPRADOR =
    'Cliente: con Authorization. Invitado: sin Authorization, con la cookie de su carrito. El personal no compra (403).';

documentar({
    metodo: 'post',
    ruta: '/checkout',
    etiqueta: ETIQUETA,
    resumen: 'Iniciar el checkout (reserva la existencia)',
    descripcion:
        'Congela precios, cupón y envío, y reserva cada unidad por MINUTOS_RESERVA (15). Cliente: `idDireccion` de su ' +
        'libreta. Invitado: `invitado` con su correo y dirección. Con la misma Idempotency-Key devuelve el mismo ' +
        'checkout; con otra, cancela el pendiente anterior del carrito y libera su reserva. Rechazos: ' +
        'STOCK_INSUFICIENTE (indica el SKU y lo disponible), CARRITO_VACIO, VARIANTE_NO_DISPONIBLE, ' +
        'CANTIDAD_EXCEDE_LIMITE, METODO_ENVIO_NO_ENCONTRADO, DIRECCION_NO_ENCONTRADA y los del cupón. ' +
        NOTA_COMPRADOR,
    cabeceras: esquemaCabeceraIdempotencia,
    cuerpo: esquemaIniciarCheckout,
    respuesta: esquemaCheckout,
    estado: 201,
    errores: [400, 401, 403, 404, 409, 422],
});
documentar({
    metodo: 'get',
    ruta: '/checkout/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Ver un checkout (resumen y cuenta regresiva)',
    descripcion: `Estado efectivo y segundos restantes de la reserva. ${NOTA_COMPRADOR}`,
    params: esquemaId,
    respuesta: esquemaCheckout,
    errores: [401, 403, 404],
});
documentar({
    metodo: 'post',
    ruta: '/checkout/{id}/pago',
    etiqueta: ETIQUETA,
    resumen: 'Pagar y crear el pedido',
    descripcion:
        'Cobra con la pasarela simulada y crea el pedido en una transacción (salida de inventario, reservas ' +
        'consumidas, uso del cupón, carrito convertido). Un checkout ya pagado devuelve su pedido sin cobrar de nuevo ' +
        '(doble clic). Rechazo del banco: 402 FONDOS_INSUFICIENTES, TARJETA_RECHAZADA, TARJETA_VENCIDA, ' +
        'CVV_INCORRECTO o PAGO_NO_PROCESADO; el intento queda registrado y se puede reintentar. 409: ' +
        'CHECKOUT_NO_PAGABLE (carrito cambiado o cancelado) o CHECKOUT_EXPIRADO (venció y ya no hay existencia; el ' +
        `cobro se anula). Máximo 10 intentos fallidos por IP cada 15 minutos. ${NOTA_COMPRADOR}`,
    params: esquemaId,
    cuerpo: esquemaPagar,
    respuesta: esquemaPagoRealizado,
    estado: 201,
    errores: [400, 401, 402, 403, 404, 409, 422, 429],
});

export function crearRutasCheckout({
    pasarela,
    claves,
    limites,
    autenticacion: { autenticarOpcional },
}: DependenciasRutas): Router {
    const c = crearControladorCheckout(crearServicioCheckout({ pasarela, claves }));
    const rutas = Router();
    rutas.post('/checkout', autenticarOpcional, c.iniciar);
    rutas.get('/checkout/:id', autenticarOpcional, c.obtener);
    rutas.post('/checkout/:id/pago', limites.pago, autenticarOpcional, c.pagar);
    return rutas;
}
