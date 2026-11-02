import type { Request, Response } from 'express';
import { hoyGuatemala } from '../../exportes/documento.js';
import { enviarDocumento } from '../../exportes/enviar.js';
import { responder, validar } from '../../http/respuesta.js';
import { usuarioDe } from '../../middlewares/autenticacion.js';
import * as repositorio from './reportes.repository.js';
import {
    esquemaCarritosAbandonados,
    esquemaExportarCarritos,
    esquemaExportarVentas,
    esquemaRango,
    esquemaVentasPeriodo,
} from './reportes.schemas.js';
import type { Generado, ServicioReportes } from './reportes.service.js';
import type { CentroTiempoReal } from './tiempoReal.js';

/* Solo el administrador (la ruta y el SP lo validan). */
export function crearControladorReportes(servicio: ServicioReportes, tiempoReal: CentroTiempoReal) {
    const idUsuario = (req: Request) => usuarioDe(req).id;

    /** X-Cache permite comprobar el caché; meta.generadoEn dice de cuándo son los números. */
    function entregar<T>(res: Response, { datos, desdeCache, generadoEn }: Generado<T>): void {
        res.setHeader('X-Cache', desdeCache ? 'HIT' : 'MISS');
        responder(res, datos, { meta: { generadoEn } });
    }

    return {
        resumen: async (req: Request, res: Response) => {
            entregar(res, await servicio.resumen(idUsuario(req), validar(esquemaRango, req.query)));
        },
        ventasPorPeriodo: async (req: Request, res: Response) => {
            entregar(res, await servicio.ventasPorPeriodo(idUsuario(req), validar(esquemaVentasPeriodo, req.query)));
        },
        ventasPorCategoria: async (req: Request, res: Response) => {
            entregar(res, await servicio.ventasPorCategoria(idUsuario(req), validar(esquemaRango, req.query)));
        },
        topProductos: async (req: Request, res: Response) => {
            entregar(res, await servicio.topProductos(idUsuario(req), validar(esquemaRango, req.query)));
        },
        carritosAbandonados: async (req: Request, res: Response) => {
            const { pagina, tamanoPagina, ...filtros } = validar(esquemaCarritosAbandonados, req.query);
            const { filas, total } = await repositorio.carritosAbandonados(
                idUsuario(req),
                filtros,
                pagina,
                tamanoPagina,
            );
            responder(res, filas, { meta: { pagina, tamanoPagina, totalRegistros: total } });
        },
        exportarVentas: async (req: Request, res: Response) => {
            const { formato, ...filtros } = validar(esquemaExportarVentas, req.query);
            const documento = await servicio.documentoVentas(idUsuario(req), filtros);
            await enviarDocumento(
                req,
                res,
                documento,
                `shopcart-ventas-${filtros.fechaDesde}_${filtros.fechaHasta}`,
                formato,
            );
        },
        exportarCarritos: async (req: Request, res: Response) => {
            const { formato, ...filtros } = validar(esquemaExportarCarritos, req.query);
            const documento = await servicio.documentoCarritos(idUsuario(req), filtros);
            await enviarDocumento(req, res, documento, `shopcart-carritos-abandonados-${hoyGuatemala()}`, formato);
        },
        tiempoReal: async (req: Request, res: Response) => {
            await tiempoReal.conectar(req, res, usuarioDe(req));
        },
    };
}
