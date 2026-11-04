/*
    Error de la API o de la conexión. `codigo` es el estable de docs/errores.md y `detalles` trae
    los errores por campo que los formularios conectan a sus controles.
*/
export interface DetalleCampo {
    campo: string;
    mensaje: string;
}

/** Códigos propios del cliente, cuando la API no llegó a responder. */
export const SIN_CONEXION = 'SIN_CONEXION';
export const TIEMPO_AGOTADO = 'TIEMPO_AGOTADO';
export const RESPUESTA_INVALIDA = 'RESPUESTA_INVALIDA';
export const SESION_TERMINADA = 'SESION_TERMINADA';

export class ErrorApi extends Error {
    constructor(
        readonly estado: number,
        readonly codigo: string,
        mensaje: string,
        readonly detalles: DetalleCampo[] = [],
        readonly requestId?: string,
        /** Segundos de espera indicados por la API (429). */
        readonly reintentarEn?: number,
    ) {
        super(mensaje);
        this.name = 'ErrorApi';
    }

    /** Fallas pasajeras: conexión, tiempo agotado o servicio no disponible. Vale la pena reintentar. */
    get esPasajero(): boolean {
        return this.estado === 0 || this.estado === 503 || this.estado === 502 || this.estado === 504;
    }
}

export const esErrorApi = (error: unknown): error is ErrorApi => error instanceof ErrorApi;

interface CuerpoError {
    error?: { codigo?: unknown; mensaje?: unknown; detalles?: unknown; requestId?: unknown };
}

function detallesDe(valor: unknown): DetalleCampo[] {
    if (!Array.isArray(valor)) return [];
    return valor.filter(
        (d): d is DetalleCampo =>
            typeof d === 'object' &&
            d !== null &&
            typeof (d as DetalleCampo).campo === 'string' &&
            typeof (d as DetalleCampo).mensaje === 'string',
    );
}

/** Convierte una respuesta de error en ErrorApi; tolera cuerpos que no sean JSON (p. ej. de un proxy). */
export async function errorDeRespuesta(respuesta: Response): Promise<ErrorApi> {
    let cuerpo: CuerpoError = {};
    try {
        cuerpo = (await respuesta.json()) as CuerpoError;
    } catch {
        /* sin cuerpo JSON: se usan los valores genéricos */
    }
    const { codigo, mensaje, detalles, requestId } = cuerpo.error ?? {};
    const espera = Number(respuesta.headers.get('Retry-After'));
    return new ErrorApi(
        respuesta.status,
        typeof codigo === 'string' ? codigo : RESPUESTA_INVALIDA,
        typeof mensaje === 'string' ? mensaje : 'No pudimos completar la operación; intenta de nuevo.',
        detallesDe(detalles),
        typeof requestId === 'string' ? requestId : (respuesta.headers.get('X-Request-Id') ?? undefined),
        Number.isFinite(espera) && espera > 0 ? espera : undefined,
    );
}
