import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { numeroErrorSql } from '../../db/index.js';
import { ErrorApi } from '../../errors/ErrorApi.js';
import type { EventoNegocio, EventosNegocio } from '../../eventos/eventosNegocio.js';
import type { UsuarioSesion } from '../../seguridad/tokens.js';

/*
    Dashboard en tiempo real por Server-Sent Events (D79).
    - Al conectar se envía de inmediato el estado del dashboard ("resumen").
    - Los avisos de negocio (D80) se agrupan: varios en el mismo segundo producen UN recálculo,
      y ese recálculo (una consulta a la base) se envía a todas las conexiones. Además se
      recalcula cada minuto, porque un carrito pasa a abandonado solo por el paso del tiempo.
    - Cada venta se avisa al momento ("venta"), una sola vez por pedido aunque el pago se repita.
    - Latido cada 25 s (comentario SSE) para que proxies y balanceadores no corten la conexión.
    - Cuando vence el access token se envía "sesion-expirada" y se cierra: el frontend renueva el
      token y se reconecta (fetch con Authorization; EventSource no permite cabeceras).
    - Sin fugas: el centro se suscribe a los avisos e inicia sus intervalos solo mientras haya
      conexiones; al cerrarse la última, cancela la suscripción y todos sus temporizadores. Un
      cliente que no lee (más de 1 MB pendiente) se desconecta para no acumular memoria.
    - Límites: 3 conexiones por usuario y 50 en total (429). Una sola instancia de la API.
*/
export interface OpcionesTiempoReal {
    latidoMs?: number;
    agrupacionMs?: number;
    refrescoMs?: number;
    maximoPorUsuario?: number;
    maximoTotal?: number;
    maximoPendienteBytes?: number;
}

interface Conexion {
    id: number;
    usuario: UsuarioSesion;
    res: Response;
    vencimiento: NodeJS.Timeout | undefined;
}

const PERMISO_DENEGADO = 50201;
const MAXIMO_TIMEOUT = 2_147_483_647;

export class CentroTiempoReal {
    private readonly conexiones = new Map<number, Conexion>();
    private siguienteId = 1;
    private cancelarSuscripcion: (() => void) | undefined;
    private latido: NodeJS.Timeout | undefined;
    private refresco: NodeJS.Timeout | undefined;
    private recalculoProgramado: NodeJS.Timeout | undefined;
    private recalculando = false;
    private recalcularOtraVez = false;
    private readonly ventasAvisadas = new Set<number>();
    private readonly opciones: Required<OpcionesTiempoReal>;

    constructor(
        private readonly eventos: EventosNegocio,
        /** Estado del dashboard, consultado con el usuario dado (el SP valida que sea administrador activo). */
        private readonly instantanea: (idUsuario: number) => Promise<unknown>,
        private readonly logger: Logger,
        opciones: OpcionesTiempoReal = {},
    ) {
        this.opciones = {
            latidoMs: 25_000,
            agrupacionMs: 1_000,
            refrescoMs: 60_000,
            maximoPorUsuario: 3,
            maximoTotal: 50,
            maximoPendienteBytes: 1024 * 1024,
            ...opciones,
        };
    }

    get totalConexiones(): number {
        return this.conexiones.size;
    }

    /** true si el centro tiene suscripción o temporizadores activos (para verificar que no hay fugas). */
    get activo(): boolean {
        return (
            this.cancelarSuscripcion !== undefined ||
            this.latido !== undefined ||
            this.refresco !== undefined ||
            this.recalculoProgramado !== undefined
        );
    }

    async conectar(req: Request, res: Response, usuario: UsuarioSesion): Promise<void> {
        const propias = [...this.conexiones.values()].filter((c) => c.usuario.id === usuario.id).length;
        if (propias >= this.opciones.maximoPorUsuario || this.conexiones.size >= this.opciones.maximoTotal) {
            throw new ErrorApi(
                429,
                'DEMASIADAS_CONEXIONES',
                'Hay demasiadas conexiones abiertas al dashboard; cierra otras pestañas.',
            );
        }

        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
        res.write('retry: 5000\n\n');

        const conexion: Conexion = { id: this.siguienteId++, usuario, res, vencimiento: undefined };
        this.conexiones.set(conexion.id, conexion);
        if (usuario.expiraEn !== undefined) {
            const restante = Math.min(Math.max(usuario.expiraEn - Date.now(), 0), MAXIMO_TIMEOUT);
            conexion.vencimiento = setTimeout(() => {
                this.enviar(conexion, 'sesion-expirada', {
                    mensaje: 'El token venció; renuévalo y vuelve a conectar.',
                });
                this.cerrar(conexion);
            }, restante);
            conexion.vencimiento.unref();
        }
        const alCerrar = () => {
            this.quitar(conexion);
        };
        req.once('close', alCerrar);
        res.once('error', alCerrar);
        this.iniciarSiHaceFalta();

        // Estado inicial solo para quien se conecta.
        try {
            const estado = await this.instantanea(usuario.id);
            if (this.conexiones.has(conexion.id)) this.enviar(conexion, 'resumen', estado);
        } catch (error) {
            this.alFallar(conexion, error);
        }
    }

    /** Cierra todas las conexiones (cierre ordenado de la API: si no, el servidor esperaría por ellas). */
    cerrarTodo(): void {
        for (const conexion of [...this.conexiones.values()]) this.cerrar(conexion);
        this.detener();
    }

    /* --- Ciclo de vida ------------------------------------------------------------------------ */

    private iniciarSiHaceFalta(): void {
        if (this.cancelarSuscripcion) return;
        this.cancelarSuscripcion = this.eventos.suscribir((evento) => {
            this.alEvento(evento);
        });
        this.latido = setInterval(() => {
            for (const conexion of this.conexiones.values()) this.escribir(conexion, ': latido\n\n');
        }, this.opciones.latidoMs);
        this.refresco = setInterval(() => {
            this.programarRecalculo();
        }, this.opciones.refrescoMs);
        this.latido.unref();
        this.refresco.unref();
    }

    private detener(): void {
        this.cancelarSuscripcion?.();
        this.cancelarSuscripcion = undefined;
        clearInterval(this.latido);
        clearInterval(this.refresco);
        clearTimeout(this.recalculoProgramado);
        this.latido = undefined;
        this.refresco = undefined;
        this.recalculoProgramado = undefined;
        this.recalcularOtraVez = false;
    }

    private quitar(conexion: Conexion): void {
        if (!this.conexiones.delete(conexion.id)) return;
        clearTimeout(conexion.vencimiento);
        if (this.conexiones.size === 0) this.detener();
    }

    private cerrar(conexion: Conexion): void {
        this.quitar(conexion);
        if (!conexion.res.writableEnded) conexion.res.end();
    }

    /* --- Avisos y recálculo ------------------------------------------------------------------- */

    private alEvento(evento: EventoNegocio): void {
        if (evento.tipo === 'VENTA' && !this.ventasAvisadas.has(evento.idPedido)) {
            this.ventasAvisadas.add(evento.idPedido);
            // Memoria acotada: solo se recuerdan las últimas 200 ventas avisadas.
            if (this.ventasAvisadas.size > 200) {
                const primera = this.ventasAvisadas.values().next().value;
                if (primera !== undefined) this.ventasAvisadas.delete(primera);
            }
            const venta = { numeroPedido: evento.numeroPedido, total: evento.total, fecha: new Date().toISOString() };
            for (const conexion of this.conexiones.values()) this.enviar(conexion, 'venta', venta);
        }
        this.programarRecalculo();
    }

    private programarRecalculo(): void {
        if (this.conexiones.size === 0) return;
        if (this.recalculando) {
            this.recalcularOtraVez = true;
            return;
        }
        if (this.recalculoProgramado) return;
        this.recalculoProgramado = setTimeout(() => {
            this.recalculoProgramado = undefined;
            void this.recalcular();
        }, this.opciones.agrupacionMs);
        this.recalculoProgramado.unref();
    }

    /** Una consulta para todos, con el primer administrador conectado que siga activo. */
    private async recalcular(): Promise<void> {
        this.recalculando = true;
        try {
            for (const conexion of [...this.conexiones.values()]) {
                try {
                    const estado = await this.instantanea(conexion.usuario.id);
                    for (const destino of this.conexiones.values()) this.enviar(destino, 'resumen', estado);
                    return;
                } catch (error) {
                    // Sin permiso (desactivado): se cierra y se intenta con el siguiente.
                    if (!this.alFallar(conexion, error)) return;
                }
            }
        } finally {
            this.recalculando = false;
            if (this.recalcularOtraVez) {
                this.recalcularOtraVez = false;
                this.programarRecalculo();
            }
        }
    }

    /** Devuelve true si se cerró la conexión por falta de permiso (se puede intentar con otra). */
    private alFallar(conexion: Conexion, error: unknown): boolean {
        if (numeroErrorSql(error) === PERMISO_DENEGADO) {
            this.enviar(conexion, 'sin-permiso', { mensaje: 'Tu usuario ya no tiene acceso al dashboard.' });
            this.cerrar(conexion);
            return true;
        }
        this.logger.error({ err: error }, 'No se pudo calcular el dashboard en tiempo real');
        return false;
    }

    /* --- Escritura ---------------------------------------------------------------------------- */

    private enviar(conexion: Conexion, evento: string, datos: unknown): void {
        this.escribir(conexion, `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    }

    private escribir(conexion: Conexion, texto: string): void {
        const { res } = conexion;
        if (res.writableEnded || res.destroyed) {
            this.quitar(conexion);
            return;
        }
        if (res.writableLength > this.opciones.maximoPendienteBytes) {
            this.logger.warn({ conexion: conexion.id }, 'Cliente SSE sin leer: se desconecta');
            this.quitar(conexion);
            res.destroy();
            return;
        }
        res.write(texto);
    }
}
