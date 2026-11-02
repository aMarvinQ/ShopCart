import type { Request, Response } from 'express';
import { hoyGuatemala, paginado, type Documento } from '../../exportes/documento.js';
import { enviarDocumento } from '../../exportes/enviar.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './bitacora.repository.js';
import { esquemaExportarBitacora, esquemaListarBitacora } from './bitacora.schemas.js';

/* Sin servicio: los filtros los valida el SP; la exportación reutiliza el modelo común (D81). */

export async function listar(req: Request, res: Response): Promise<void> {
    const { pagina, tamanoPagina, ...filtros } = validar(esquemaListarBitacora, req.query);
    const { filas, total } = await repositorio.listar(usuarioDe(req).id, filtros, pagina, tamanoPagina);
    responder(res, filas, { meta: { pagina, tamanoPagina, totalRegistros: total } });
}

export async function exportar(req: Request, res: Response): Promise<void> {
    const { formato, ...filtros } = validar(esquemaExportarBitacora, req.query);
    const idUsuario = usuarioDe(req).id;
    const registros = await paginado((pagina, tamano) => repositorio.listar(idUsuario, filtros, pagina, tamano));
    const documento: Documento = {
        titulo: 'ShopCart · Bitácora',
        subtitulo: `${String(registros.total)} registros · generado ${new Date().toISOString()}`,
        secciones: [
            {
                titulo: 'Bitácora',
                columnas: [
                    { titulo: 'Fecha', clave: 'fecha', tipo: 'fechaHora', ancho: 18 },
                    { titulo: 'Usuario', clave: 'usuario', ancho: 22 },
                    { titulo: 'Correo', clave: 'correo', ancho: 28 },
                    { titulo: 'Rol', clave: 'codigoRol', ancho: 10 },
                    { titulo: 'Módulo', clave: 'modulo', ancho: 14 },
                    { titulo: 'Entidad', clave: 'entidad', ancho: 16 },
                    { titulo: 'ID', clave: 'idEntidad', ancho: 8 },
                    { titulo: 'Acción', clave: 'accion', ancho: 16 },
                    { titulo: 'Valor anterior', clave: 'valorAnterior', ancho: 50 },
                    { titulo: 'Valor nuevo', clave: 'valorNuevo', ancho: 50 },
                ],
                filas: registros.filas,
                nota: registros.nota,
            },
        ],
    };
    await enviarDocumento(req, res, documento, `shopcart-bitacora-${hoyGuatemala()}`, formato);
}
