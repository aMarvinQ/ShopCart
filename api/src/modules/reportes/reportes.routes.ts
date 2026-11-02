import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import { hoyGuatemala } from '../../exportes/documento.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { listar as listarPedidos } from '../pedidos/pedidos.repository.js';
import { crearControladorReportes } from './reportes.controller.js';
import {
    esquemaCarritoAbandonado,
    esquemaCarritosAbandonados,
    esquemaCategoria,
    esquemaExportarCarritos,
    esquemaExportarVentas,
    esquemaPeriodo,
    esquemaRango,
    esquemaResumen,
    esquemaTopProducto,
    esquemaVentasPeriodo,
} from './reportes.schemas.js';
import { crearServicioReportes, type ServicioReportes } from './reportes.service.js';
import { CentroTiempoReal, type OpcionesTiempoReal } from './tiempoReal.js';

const ETIQUETA = 'Reportes';
const ROLES = ['ADMIN'];
const NOTA_CACHE =
    'Puede venir del caché (máximo 5 minutos; se vacía con cada venta, cancelación, devolución, cambio de inventario, ' +
    'catálogo o parámetro): cabecera X-Cache HIT/MISS y meta.generadoEn.';

documentar({
    metodo: 'get',
    ruta: '/reportes/resumen',
    etiqueta: ETIQUETA,
    resumen: 'Indicadores del dashboard',
    descripcion: `Ventas netas, pedidos, ticket promedio, unidades, devoluciones, carritos abandonados y existencia baja. ${NOTA_CACHE}`,
    roles: ROLES,
    query: esquemaRango,
    respuesta: esquemaResumen,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/ventas',
    etiqueta: ETIQUETA,
    resumen: 'Ventas por día, semana o mes',
    descripcion: `Una fila por periodo, incluidos los que no tienen ventas (para la gráfica). Por día, máximo 366 días. ${NOTA_CACHE}`,
    roles: ROLES,
    query: esquemaVentasPeriodo,
    respuesta: z.array(esquemaPeriodo),
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/ventas-por-categoria',
    etiqueta: ETIQUETA,
    resumen: 'Ventas por categoría',
    descripcion: NOTA_CACHE,
    roles: ROLES,
    query: esquemaRango,
    respuesta: z.array(esquemaCategoria),
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/top-productos',
    etiqueta: ETIQUETA,
    resumen: 'Top 10 productos más vendidos',
    descripcion: `Por unidades netas (descontadas las devoluciones). ${NOTA_CACHE}`,
    roles: ROLES,
    query: esquemaRango,
    respuesta: z.array(esquemaTopProducto),
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/carritos-abandonados',
    etiqueta: ETIQUETA,
    resumen: 'Carritos abandonados',
    descripcion:
        'Con productos y sin actividad desde HORAS_CARRITO_ABANDONADO; filtro opcional por la última actividad.',
    roles: ROLES,
    query: esquemaCarritosAbandonados,
    respuesta: z.array(esquemaCarritoAbandonado),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/exportar',
    etiqueta: ETIQUETA,
    resumen: 'Descargar el reporte de ventas (Excel o PDF)',
    descripcion:
        'Indicadores, ventas por periodo, por categoría, top 10 y existencias bajas en un solo archivo. Excel: una ' +
        'hoja por sección. Responde el archivo (Content-Disposition: attachment).',
    roles: ROLES,
    query: esquemaExportarVentas,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/carritos-abandonados/exportar',
    etiqueta: ETIQUETA,
    resumen: 'Descargar los carritos abandonados (Excel o PDF)',
    descripcion: 'Máximo 10 000 filas (el archivo lo indica si hay más).',
    roles: ROLES,
    query: esquemaExportarCarritos,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/reportes/tiempo-real',
    etiqueta: ETIQUETA,
    resumen: 'Dashboard en tiempo real (Server-Sent Events)',
    descripcion:
        'Flujo `text/event-stream`. Eventos: `resumen` (al conectar y cuando cambian los números, agrupado por ' +
        'segundo: indicadores de hoy y últimos 5 pedidos), `venta` (cada pedido nuevo), `sesion-expirada` (el token ' +
        'venció: renuévalo y reconecta), `sin-permiso`. Latido cada 25 s. Ábrelo con fetch y Authorization ' +
        '(EventSource no envía cabeceras). Máximo 3 conexiones por usuario (429 DEMASIADAS_CONEXIONES). ' +
        'Swagger no muestra flujos: pruébalo con el frontend o con curl -N.',
    roles: ROLES,
    errores: [429],
});

export interface ModuloReportes {
    rutas: Router;
    /** Expuestos para el cierre ordenado y el diagnóstico (las pruebas verifican que no haya fugas). */
    servicio: ServicioReportes;
    tiempoReal: CentroTiempoReal;
}

export function crearRutasReportes(
    { eventos, alCerrar, logger, autenticacion: { autenticar, autorizar } }: DependenciasRutas,
    opcionesTiempoReal: OpcionesTiempoReal = {},
): ModuloReportes {
    const servicio = crearServicioReportes(eventos);
    const tiempoReal = new CentroTiempoReal(
        eventos,
        async (idUsuario) => {
            const hoy = hoyGuatemala();
            const [resumen, pedidos] = await Promise.all([
                servicio.resumen(idUsuario, { fechaDesde: hoy, fechaHasta: hoy }),
                listarPedidos(idUsuario, { pagina: 1, tamanoPagina: 5 }),
            ]);
            return { hoy, resumen: resumen.datos, ultimosPedidos: pedidos.filas, generadoEn: new Date().toISOString() };
        },
        logger,
        opcionesTiempoReal,
    );
    alCerrar(() => {
        tiempoReal.cerrarTodo();
    });
    const c = crearControladorReportes(servicio, tiempoReal);

    const rutas = Router();
    const admin = [autenticar, autorizar('ADMIN')];
    rutas.get('/reportes/resumen', ...admin, c.resumen);
    rutas.get('/reportes/ventas', ...admin, c.ventasPorPeriodo);
    rutas.get('/reportes/ventas-por-categoria', ...admin, c.ventasPorCategoria);
    rutas.get('/reportes/top-productos', ...admin, c.topProductos);
    rutas.get('/reportes/carritos-abandonados', ...admin, c.carritosAbandonados);
    rutas.get('/reportes/exportar', ...admin, c.exportarVentas);
    rutas.get('/reportes/carritos-abandonados/exportar', ...admin, c.exportarCarritos);
    rutas.get('/reportes/tiempo-real', ...admin, c.tiempoReal);
    return { rutas, servicio, tiempoReal };
}
