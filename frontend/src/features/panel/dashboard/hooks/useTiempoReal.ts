import { useEffect, useEffectEvent, useState } from 'react';
import { renovarSesion } from '../../../../sesion/renovacion';
import { avisarSesionTerminada, obtenerToken } from '../../../../sesion/token';
import { crearLectorSse, type EventoSse } from '../flujoSse';

const RUTA = '/api/v1/reportes/tiempo-real';
const ESPERA_INICIAL_MS = 1_000;
const ESPERA_MAXIMA_MS = 30_000;

/**
 * - conectando: primera conexión.
 * - en-vivo: llegó el estado del dashboard y los cambios se reciben al momento.
 * - reconectando: se cortó; se reintenta con una espera que crece hasta 30 s.
 * - sin-permiso: el usuario ya no es administrador activo; no se reintenta.
 */
export type EstadoTiempoReal = 'conectando' | 'en-vivo' | 'reconectando' | 'sin-permiso';

/*
    Un solo flujo por pantalla, cerrado al salir de ella (y con él, al cerrar sesión). Si el token
    vence, la API lo avisa y corta: se renueva y se reconecta sin esperar.
*/
export function useTiempoReal(alEvento: (evento: EventoSse) => void): EstadoTiempoReal {
    const [estado, setEstado] = useState<EstadoTiempoReal>('conectando');
    const recibir = useEffectEvent(alEvento);

    useEffect(() => {
        const control = new AbortController();
        let espera = ESPERA_INICIAL_MS;
        // Tras renovar el token se reconecta al momento, pero una sola vez seguida: si vuelve a
        // fallar sin haber recibido nada, se espera como en cualquier corte (sin ciclos rápidos).
        let renovadoSinDatos = false;
        let temporizador: ReturnType<typeof setTimeout> | undefined;

        /* Devuelve true si hay que reconectar de inmediato (token renovado). */
        async function escuchar(): Promise<boolean> {
            const token = obtenerToken() ?? (await renovarSesion())?.accessToken;
            if (!token) {
                avisarSesionTerminada();
                return false;
            }
            const respuesta = await fetch(RUTA, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
                signal: control.signal,
            });
            if (respuesta.status === 401) return renovar();
            if (respuesta.status === 403) {
                setEstado('sin-permiso');
                control.abort();
                return false;
            }
            if (!respuesta.ok || !respuesta.body) throw new Error(`HTTP ${String(respuesta.status)}`);

            const leer = crearLectorSse();
            const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
            let tokenVencido = false;
            for (;;) {
                const { value, done } = await lector.read();
                if (done) break;
                for (const evento of leer(value)) {
                    if (evento.evento === 'resumen') {
                        setEstado('en-vivo');
                        espera = ESPERA_INICIAL_MS;
                        renovadoSinDatos = false;
                    } else if (evento.evento === 'sesion-expirada') {
                        tokenVencido = true;
                    } else if (evento.evento === 'sin-permiso') {
                        setEstado('sin-permiso');
                        control.abort();
                        return false;
                    }
                    recibir(evento);
                }
            }
            return tokenVencido ? renovar() : false;
        }

        async function renovar(): Promise<boolean> {
            if (await renovarSesion()) return true;
            avisarSesionTerminada();
            control.abort();
            return false;
        }

        async function conectar(): Promise<void> {
            let inmediato = false;
            try {
                inmediato = await escuchar();
            } catch {
                /* red caída o API reiniciada: se reintenta abajo */
            }
            if (control.signal.aborted) return;
            if (inmediato && !renovadoSinDatos) {
                renovadoSinDatos = true;
                void conectar();
                return;
            }
            setEstado('reconectando');
            temporizador = setTimeout(() => void conectar(), espera);
            espera = Math.min(espera * 2, ESPERA_MAXIMA_MS);
        }

        void conectar();
        return () => {
            control.abort();
            clearTimeout(temporizador);
        };
    }, []);

    return estado;
}
