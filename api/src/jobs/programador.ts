import type { Logger } from 'pino';

/*
    Tarea periódica dentro del proceso de la API. Nunca se encima consigo misma: si una
    ejecución sigue en curso cuando toca la siguiente, esa se omite. Un error queda en el log y
    no detiene las siguientes ejecuciones. detener() cancela las próximas y espera la que esté
    en curso (cierre ordenado). El temporizador no impide que el proceso termine.
*/
export interface TareaProgramada {
    /** Ejecuta la tarea ahora (salvo que ya esté en curso); resuelve al terminar. */
    ejecutar(): Promise<void>;
    detener(): Promise<void>;
}

export function programarTarea(
    nombre: string,
    intervaloMs: number,
    tarea: () => Promise<void>,
    logger: Logger,
): TareaProgramada {
    let enCurso: Promise<void> | null = null;
    let detenida = false;

    const ejecutar = (): Promise<void> => {
        if (detenida) return Promise.resolve();
        if (enCurso) {
            logger.debug({ tarea: nombre }, 'Ejecución omitida: la anterior sigue en curso');
            return enCurso;
        }
        enCurso = tarea()
            .catch((error: unknown) => {
                logger.error({ err: error, tarea: nombre }, 'Falló la tarea programada');
            })
            .finally(() => {
                enCurso = null;
            });
        return enCurso;
    };

    const temporizador = setInterval(() => void ejecutar(), intervaloMs).unref();

    return {
        ejecutar,
        async detener() {
            detenida = true;
            clearInterval(temporizador);
            if (enCurso) await enCurso;
        },
    };
}
