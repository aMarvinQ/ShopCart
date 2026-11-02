import { Router } from 'express';
import { documentar, type DefinicionRuta } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { crearControladorCarrito } from './carrito.controller.js';
import {
    esquemaAgregarItem,
    esquemaCantidad,
    esquemaCarrito,
    esquemaCodigoCupon,
    esquemaIdVariante,
} from './carrito.schemas.js';

/*
    Carrito del cliente (con access token) o del invitado (cookie shopcart_invitado, que se crea
    al agregar el primer producto). Swagger envía la cookie automáticamente; para probar como
    cliente, autoriza con el token de un cliente.
*/
const ETIQUETA = 'Carrito';
const NOTA_COMPRADOR =
    'Cliente: con Authorization (un token vencido responde 401). Invitado: sin Authorization, con su cookie. ' +
    'El personal no tiene carrito (403).';

function doc(definicion: Omit<DefinicionRuta, 'etiqueta' | 'respuesta'>): void {
    documentar({
        ...definicion,
        etiqueta: ETIQUETA,
        respuesta: esquemaCarrito,
        descripcion: `${definicion.descripcion ?? ''} ${NOTA_COMPRADOR}`.trim(),
        errores: [...new Set([...(definicion.errores ?? []), 401, 403])],
    });
}

doc({
    metodo: 'get',
    ruta: '/carrito',
    resumen: 'Ver el carrito',
    descripcion:
        'Precios vigentes, estado de cada línea (DISPONIBLE, AGOTADO, CANTIDAD_EXCEDIDA, NO_DISPONIBLE) y el cupón con ' +
        'su descuento o el motivo por el que no aplica. Sin carrito devuelve uno vacío (idCarrito null).',
});
doc({
    metodo: 'post',
    ruta: '/carrito/items',
    resumen: 'Agregar un producto',
    descripcion:
        'Si la variante ya está, suma la cantidad. El tope por línea es el menor entre MAXIMO_UNIDADES_POR_LINEA y lo ' +
        'disponible; el error indica cuántas se pueden llevar. Al invitado sin cookie se le crea.',
    cuerpo: esquemaAgregarItem,
    errores: [400, 404, 409, 422],
});
doc({
    metodo: 'put',
    ruta: '/carrito/items/{idVariante}',
    resumen: 'Cambiar la cantidad de un producto',
    params: esquemaIdVariante,
    cuerpo: esquemaCantidad,
    errores: [400, 404, 409, 422],
});
doc({
    metodo: 'delete',
    ruta: '/carrito/items/{idVariante}',
    resumen: 'Quitar un producto',
    params: esquemaIdVariante,
    errores: [400, 404],
});
doc({ metodo: 'delete', ruta: '/carrito', resumen: 'Vaciar el carrito', errores: [404] });
doc({
    metodo: 'post',
    ruta: '/carrito/cupon',
    resumen: 'Aplicar un cupón',
    descripcion:
        'Reemplaza al anterior. No consume usos (se consumen al pagar). Rechazos: CUPON_INVALIDO, CUPON_NO_VIGENTE, ' +
        'CUPON_VENCIDO, CUPON_AGOTADO, CUPON_SOLO_REGISTRADOS, CUPON_LIMITE_CLIENTE, CUPON_MONTO_MINIMO, ' +
        'CUPON_SIN_PRODUCTOS_ELEGIBLES, CARRITO_VACIO.',
    cuerpo: esquemaCodigoCupon,
    errores: [400, 404, 409],
});
doc({ metodo: 'delete', ruta: '/carrito/cupon', resumen: 'Quitar el cupón', errores: [404] });

export function crearRutasCarrito({ config, autenticacion: { autenticarOpcional } }: DependenciasRutas): Router {
    const c = crearControladorCarrito(config);
    const rutas = Router();
    rutas.get('/carrito', autenticarOpcional, c.obtener);
    rutas.post('/carrito/items', autenticarOpcional, c.agregar);
    rutas.put('/carrito/items/:idVariante', autenticarOpcional, c.actualizarCantidad);
    rutas.delete('/carrito/items/:idVariante', autenticarOpcional, c.quitar);
    rutas.delete('/carrito', autenticarOpcional, c.vaciar);
    rutas.post('/carrito/cupon', autenticarOpcional, c.aplicarCupon);
    rutas.delete('/carrito/cupon', autenticarOpcional, c.quitarCupon);
    return rutas;
}
