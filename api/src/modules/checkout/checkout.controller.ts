import type { Request, Response } from 'express';
import { esquemaId } from '../../http/esquemas.js';
import { responder, validar } from '../../http/respuesta.js';
import { compradorDe } from '../carrito/comprador.js';
import { esquemaCabeceraIdempotencia, esquemaIniciarCheckout, esquemaPagar } from './checkout.schemas.js';
import type { ServicioCheckout } from './checkout.service.js';

/* Cliente (token) o invitado (cookie), como en el carrito. */
export function crearControladorCheckout(servicio: ServicioCheckout) {
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
        },
    };
}
