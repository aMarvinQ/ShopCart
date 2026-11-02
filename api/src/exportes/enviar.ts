import type { Request, Response } from 'express';
import type { Documento } from './documento.js';
import { escribirExcel } from './excel.js';
import { escribirPdf } from './pdf.js';

export type Formato = 'xlsx' | 'pdf';

const TIPOS: Record<Formato, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pdf: 'application/pdf',
};

/**
 * Envía el documento como descarga, escribiéndolo en flujo hacia la respuesta.
 * - Si el cliente cancela la descarga, se deja de leer de la base.
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
    const estado = { cancelado: false };
    const alCerrar = () => {
        if (!res.writableFinished) estado.cancelado = true;
    };
    res.once('close', alCerrar);

    res.status(200);
    res.setHeader('Content-Type', TIPOS[formato]);
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}.${formato}"`);
    res.setHeader('Cache-Control', 'no-store');
    try {
        const escribir = formato === 'xlsx' ? escribirExcel : escribirPdf;
        await escribir(documento, res, () => estado.cancelado);
        if (estado.cancelado) req.log.info({ nombre }, 'Exportación cancelada por el cliente');
    } catch (error) {
        if (!res.headersSent) {
            res.removeHeader('Content-Disposition');
            throw error;
        }
        req.log.error({ err: error, nombre }, 'Falló la exportación a mitad del archivo');
        res.destroy(error instanceof Error ? error : new Error(String(error)));
    } finally {
        res.off('close', alCerrar);
    }
}
