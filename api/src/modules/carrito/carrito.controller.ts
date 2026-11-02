import type { Request, Response } from 'express';
import type { Configuracion } from '../../config/configuracion.js';
import { escribirTokenInvitado } from '../../http/cookieInvitado.js';
import { responder, validar } from '../../http/respuesta.js';
import * as repositorio from './carrito.repository.js';
import { esquemaAgregarItem, esquemaCantidad, esquemaCodigoCupon, esquemaIdVariante } from './carrito.schemas.js';
import * as servicio from './carrito.service.js';
import type { ResultadoCarrito } from './carrito.service.js';
import { compradorDe as comprador } from './comprador.js';

export function crearControladorCarrito(config: Configuracion) {
    function entregar(res: Response, { carrito, tokenNuevo }: ResultadoCarrito): void {
        if (tokenNuevo) escribirTokenInvitado(res, config, tokenNuevo);
        responder(res, carrito);
    }

    return {
        obtener: async (req: Request, res: Response) => {
            entregar(res, await servicio.obtener(comprador(req)));
        },
        agregar: async (req: Request, res: Response) => {
            const { idVariante, cantidad } = validar(esquemaAgregarItem, req.body);
            entregar(res, await servicio.agregar(comprador(req), idVariante, cantidad));
        },
        actualizarCantidad: async (req: Request, res: Response) => {
            const { idVariante } = validar(esquemaIdVariante, req.params);
            const { cantidad } = validar(esquemaCantidad, req.body);
            entregar(
                res,
                await servicio.modificar(comprador(req), (p) =>
                    repositorio.actualizarCantidad(p, idVariante, cantidad),
                ),
            );
        },
        quitar: async (req: Request, res: Response) => {
            const { idVariante } = validar(esquemaIdVariante, req.params);
            entregar(res, await servicio.modificar(comprador(req), (p) => repositorio.quitarItem(p, idVariante)));
        },
        vaciar: async (req: Request, res: Response) => {
            entregar(res, await servicio.modificar(comprador(req), (p) => repositorio.vaciar(p)));
        },
        aplicarCupon: async (req: Request, res: Response) => {
            const { codigo } = validar(esquemaCodigoCupon, req.body);
            entregar(res, await servicio.modificar(comprador(req), (p) => repositorio.aplicarCupon(p, codigo)));
        },
        quitarCupon: async (req: Request, res: Response) => {
            entregar(res, await servicio.modificar(comprador(req), (p) => repositorio.quitarCupon(p)));
        },
    };
}
