import type { Request, Response } from 'express';
import type { EventosNegocio } from '../../eventos/eventosNegocio.js';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { compradorDe } from '../carrito/comprador.js';
import { esquemaCabeceraIdempotencia, esquemaIniciarCheckout, esquemaPagar } from './checkout.schemas.js';
import type { ServicioCheckout } from './checkout.service.js';

/* Cliente (token) o invitado (cookie), como en el carrito. */
export function crearControladorCheckout(servicio: ServicioCheckout, eventos: EventosNegocio) {
    return {
        iniciar: async (req: Request, res: Response) => {
            const { 'idempotency-key': clave } = validar(esquemaCabeceraIdempotencia, req.headers);
            const datos = validar(esquemaIniciarCheckout, req.body);
            responder(res, await servicio.iniciar(compradorDe(req), clave, datos), { estado: 201 });
        },
        obtener: async (req: Request, res: Response) => {
            const { id } = validar(esquemaId, req.params);
            responder(res, await servicio.obtener(compradorDe(req), id));
        },
        pagar: async (req: Request, res: Response) => {
            const { id } = validar(esquemaId, req.params);
            const { tarjeta } = validar(esquemaPagar, req.body);
            const pago = await servicio.pagar(compradorDe(req), id, tarjeta, req.log);
            res.setHeader('Cache-Control', 'no-store');
            responder(res, pago, { estado: 201 });
            // Después de confirmado: el dashboard lo muestra y el caché de reportes se vacía (D80).
            // Un pago repetido avisa el mismo pedido; el dashboard lo muestra una sola vez.
            eventos.emitir({
                tipo: 'VENTA',
                idPedido: Number(pago.pedido.idPedido),
                numeroPedido: String(pago.pedido.numeroPedido),
                total: Number(pago.pedido.total),
            });
        },
    };
}
