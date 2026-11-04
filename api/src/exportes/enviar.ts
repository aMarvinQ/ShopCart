import type { Request, Response } from 'express';
import { ErrorApi } from '../errors/ErrorApi.js';
import type { Documento } from './documento.js';
import { escribirExcel } from './excel.js';
import { escribirPdf } from './pdf.js';

export type Formato = 'xlsx' | 'pdf';

const TIPOS: Record<Formato, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
};

/*
    Cada exportación consulta la base muchas veces y puede durar lo que tarde el cliente en leer:
    se limita cuántas corren a la vez en el proceso. El cupo se libera siempre, también si el
    cliente se desconecta a mitad de la descarga.
*/
const MAXIMO_SIMULTANEAS = 3;
let activas = 0;

/** Exportaciones en curso (para las pruebas y el diagnóstico). */
export const exportacionesActivas = (): number => activas;

/**
 * Envía el documento como descarga, escribiéndolo en flujo hacia la respuesta.
 * - Si el cliente cancela la descarga, se deja de leer de la base.
 * - Si ya hay demasiadas en curso responde 429, antes de enviar nada.
 * - Si algo falla antes de enviar datos, el error sigue al manejador normal (JSON); si falla a
 *   mitad del archivo ya no se puede responder JSON: se corta la conexión y queda en el log,
 *   así el cliente nunca recibe un archivo incompleto como si estuviera completo.
 */
export async function enviarDocumento(
    req: Request,
    res: Response,
    documento: Documento,
    nombre: string,
    formato: Formato,
): Promise<void> {
    if (activas >= MAXIMO_SIMULTANEAS) {
        throw new ErrorApi(
            429,
            'DEMASIADAS_EXPORTACIONES',
            'Hay demasiadas exportaciones en curso; intenta de nuevo en unos momentos.',
        );
    }
    activas += 1;

    const estado = { cancelado: false };
    let avisarCierre: () => void = () => undefined;
    const cerrado = new Promise<void>((resolver) => (avisarCierre = resolver));
    const alCerrar = () => {
        if (!res.writableFinished) estado.cancelado = true;
        avisarCierre();
    };
    res.once('close', alCerrar);

    res.status(200);
    res.setHeader('Content-Type', TIPOS[formato]);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.${formato}"`);
    res.setHeader('Cache-Control', 'no-store');
    try {
        const escribir = formato === 'xlsx' ? escribirExcel : escribirPdf;
        // Si el cliente se va, no se espera al escritor: su cierre podría no completarse nunca.
        await Promise.race([escribir(documento, res, () => estado.cancelado), cerrado]);
        if (estado.cancelado) req.log.info({ nombre }, 'Exportación cancelada por el cliente');
    } catch (error) {
        if (!res.headersSent) {
            res.removeHeader('Content-Disposition');
            throw error;
        }
        req.log.error({ err: error, nombre }, 'Falló la exportación a mitad del archivo');
        res.destroy(error instanceof Error ? error : new Error(String(error)));
    } finally {
        activas -= 1;
        res.off('close', alCerrar);
    }
}
