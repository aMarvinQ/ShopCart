import { EventEmitter } from 'node:events';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/*
    Avisos internos de negocio (D80): el caché de reportes y el dashboard en tiempo real se
    enteran de que los números cambiaron. Solo se avisa después de que el SP confirmó la
    operación (respuesta exitosa), nunca antes: un aviso jamás describe algo que se revirtió.
    Es un emisor en memoria (una instancia de la API); con varias haría falta Redis Pub/Sub.
*/
export type EventoNegocio =
    /** Un pago creó (o devolvió) un pedido. */
    | { tipo: 'VENTA'; idPedido: number; numeroPedido: string; total: number }
    /** Cambió algo que afecta los reportes: pedidos, inventario, catálogo o parámetros. */
    | { tipo: 'CAMBIO'; origen: string };

type Oyente = (evento: EventoNegocio) => void;
const EVENTO = 'negocio';

export class EventosNegocio {
    private readonly emisor = new EventEmitter();

    constructor() {
        // Oyentes esperados: el caché y el dashboard. Más que esto indica una fuga.
        this.emisor.setMaxListeners(5);
    }

    emitir(evento: EventoNegocio): void {
        this.emisor.emit(EVENTO, evento);
    }

    /** Devuelve la función que cancela la suscripción (quien se suscribe debe llamarla). */
    suscribir(oyente: Oyente): () => void {
        // Un oyente que falla no debe romper la petición que emitió ni a los demás oyentes.
        const seguro: Oyente = (evento) => {
            try {
                oyente(evento);
            } catch {
                /* el oyente registra su propio error */
            }
        };
        this.emisor.on(EVENTO, seguro);
        return () => this.emisor.off(EVENTO, seguro);
    }

    suscriptores(): number {
        return this.emisor.listenerCount(EVENTO);
    }

    /**
     * Middleware global: avisa un CAMBIO cuando una petición que modifica (no GET) a una ruta que
     * afecta los reportes termina con éxito. Va una sola vez en la app (no por router: en Express
     * cada router montado en "/" ve todas las peticiones, y avisaría por rutas ajenas).
     */
    avisarCambios(rutas: RegExp): RequestHandler {
        return (req: Request, res: Response, next: NextFunction) => {
            const coincidencia = req.method !== 'GET' && req.method !== 'HEAD' ? rutas.exec(req.path) : null;
            if (coincidencia) {
                res.once('finish', () => {
                    if (res.statusCode < 400) this.emitir({ tipo: 'CAMBIO', origen: coincidencia[1] ?? req.path });
                });
            }
            next();
        };
    }
}
