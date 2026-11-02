import type { RequestHandler } from 'express';
import multer from 'multer';
import { ErrorApi } from '../errors/ErrorApi.js';

/*
    Recepción de archivos (multipart/form-data, campo "archivos"): en memoria y con límites
    estrictos antes de leer el contenido. La validación del tipo real la hace AlmacenImagenes.
*/
export const MAXIMO_ARCHIVOS = 10;
export const MAXIMO_BYTES = 5 * 1024 * 1024;

const receptor = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAXIMO_BYTES, files: MAXIMO_ARCHIVOS, fields: 0, parts: MAXIMO_ARCHIVOS },
}).array('archivos', MAXIMO_ARCHIVOS);

export const recibirImagenes: RequestHandler = (req, res, next) => {
    receptor(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                next(new ErrorApi(413, 'ARCHIVO_DEMASIADO_GRANDE', 'Cada imagen puede pesar hasta 5 MB.'));
                return;
            }
            next(
                new ErrorApi(
                    400,
                    'ARCHIVOS_INVALIDOS',
                    `Envía de 1 a ${MAXIMO_ARCHIVOS} imágenes en el campo "archivos" (multipart/form-data).`,
                ),
            );
            return;
        }
        next(error);
    });
};
