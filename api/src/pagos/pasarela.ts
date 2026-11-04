import { randomInt, randomUUID } from 'node:crypto';
import { marcaDe, normalizarNumero, type Marca } from './tarjeta.js';

/*
    Pasarela de pagos (D2). La API depende solo de la interfaz PasarelaPagos: en producción se
    reemplaza por el adaptador de una pasarela real, donde además la tarjeta la captura el
    navegador (tokenización) y el servidor nunca la ve.

    PasarelaSimulada se comporta como una real en lo que importa al checkout:
    - Idempotencia: la misma clave devuelve la misma autorización, aunque lleguen dos
      peticiones a la vez. Así un doble clic no cobra dos veces.
    - Tarjetas de prueba (D74) con resultado fijo; cualquier otra tarjeta válida se aprueba.
    - Anulación de un cobro aprobado que no terminó en pedido.
    Guarda las claves en memoria 24 horas (una pasarela real las guarda de su lado). Con varias
    instancias de la API, la base sigue impidiendo el doble pedido y la API anula el cobro sobrante.
*/

export interface DatosTarjeta {
    numero: string;
    titular: string;
    vencimiento: string;
    cvv: string;
}

export interface SolicitudCobro {
    /** Misma clave = mismo cobro. */
    claveIdempotencia: string;
    monto: number;
    descripcion: string;
    tarjeta: DatosTarjeta;
}

/** Motivo de rechazo como lo registra la base (máximo 40 caracteres). */
export type MotivoRechazo =
    | 'FONDOS_INSUFICIENTES'
    | 'TARJETA_RECHAZADA'
    | 'TARJETA_VENCIDA'
    | 'CVV_INCORRECTO'
    | 'TARJETA_REPORTADA'
    | 'ERROR_PROCESADOR';

interface DatosNoSensibles {
    marca: Marca;
    ultimos4: string;
    /** Identificador del cobro en la pasarela (máximo 64 caracteres). */
    referencia: string;
}

export type ResultadoCobro =
    | (DatosNoSensibles & { estado: 'APROBADO'; codigoAutorizacion: string })
    | (DatosNoSensibles & { estado: 'RECHAZADO'; motivo: MotivoRechazo });

export interface PasarelaPagos {
    cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro>;
    /** Anula un cobro aprobado (no se capturó: el pedido no se creó). */
    anular(referencia: string): Promise<void>;
}

/** Tarjetas de prueba con resultado fijo (todas pasan Luhn). */
export const TARJETAS_PRUEBA: Readonly<Record<string, MotivoRechazo>> = {
    '4000000000000002': 'TARJETA_RECHAZADA',
    '4000000000009995': 'FONDOS_INSUFICIENTES',
    '4000000000000069': 'TARJETA_VENCIDA',
    '4000000000000127': 'CVV_INCORRECTO',
    '4000000000009979': 'TARJETA_REPORTADA',
    '4000000000000119': 'ERROR_PROCESADOR',
};

const VIGENCIA_CLAVE_MS = 24 * 60 * 60 * 1000;
const MAXIMO_CLAVES = 10_000;
/** Memoria acotada: solo se conservan los últimos movimientos, para diagnóstico y pruebas. */
const MAXIMO_MOVIMIENTOS = 1_000;

export interface MovimientoPasarela {
    tipo: 'COBRO' | 'ANULACION';
    referencia: string;
    monto?: number;
}

export class PasarelaSimulada implements PasarelaPagos {
    private readonly claves = new Map<string, { resultado: Promise<ResultadoCobro>; expira: number }>();
    private readonly historial: MovimientoPasarela[] = [];

    /** @param latenciaMs demora de cada cobro, como la de una pasarela real (0 en pruebas). */
    constructor(private readonly latenciaMs = 0) {}

    cobrar(solicitud: SolicitudCobro): Promise<ResultadoCobro> {
        const ahora = Date.now();
        const existente = this.claves.get(solicitud.claveIdempotencia);
        if (existente && existente.expira > ahora) return existente.resultado;

        this.depurar(ahora);
        const resultado = this.procesar(solicitud);
        this.claves.set(solicitud.claveIdempotencia, { resultado, expira: ahora + VIGENCIA_CLAVE_MS });
        // Solo un cobro aprobado queda fijo: tras un rechazo o una falla, el reintento vuelve a
        // consultar al banco (las peticiones simultáneas igual comparten el mismo intento).
        const liberar = () => this.claves.delete(solicitud.claveIdempotencia);
        void resultado.then((r) => {
            if (r.estado === 'RECHAZADO') liberar();
        }, liberar);
        return resultado;
    }

    anular(referencia: string): Promise<void> {
        this.registrar({ tipo: 'ANULACION', referencia });
        return Promise.resolve();
    }

    /** Últimos cobros y anulaciones (para las pruebas y el diagnóstico; sin datos de tarjeta). */
    movimientos(): readonly MovimientoPasarela[] {
        return this.historial;
    }

    private async procesar({ tarjeta, monto }: SolicitudCobro): Promise<ResultadoCobro> {
        if (this.latenciaMs > 0) await new Promise((resolver) => setTimeout(resolver, this.latenciaMs));
        const numero = normalizarNumero(tarjeta.numero);
        const marca = marcaDe(numero);
        if (!marca) throw new Error('La tarjeta llegó a la pasarela sin validarse.');
        const comun = { marca, ultimos4: numero.slice(-4), referencia: `SIM-${randomUUID()}` };
        const motivo = TARJETAS_PRUEBA[numero];
        if (motivo) return { ...comun, estado: 'RECHAZADO', motivo };

        this.registrar({ tipo: 'COBRO', referencia: comun.referencia, monto });
        return { ...comun, estado: 'APROBADO', codigoAutorizacion: String(randomInt(100_000, 1_000_000)) };
    }

    private registrar(movimiento: MovimientoPasarela): void {
        this.historial.push(movimiento);
        if (this.historial.length > MAXIMO_MOVIMIENTOS) this.historial.shift();
    }

    private depurar(ahora: number): void {
        for (const [clave, { expira }] of this.claves) if (expira <= ahora) this.claves.delete(clave);
        // Tope de memoria: descarta las más antiguas (el Map conserva el orden de inserción).
        while (this.claves.size >= MAXIMO_CLAVES) {
            const primera = this.claves.keys().next().value;
            if (primera === undefined) break;
            this.claves.delete(primera);
        }
    }
}
