import { CacheMemoria } from '../../cache/cacheMemoria.js';
import type { EventosNegocio } from '../../eventos/eventosNegocio.js';
import { paginado, type Documento, type Fila } from '../../exportes/documento.js';
import { listarExistencias } from '../inventario/inventario.repository.js';
import * as repositorio from './reportes.repository.js';
import type { FiltrosCarritos, FiltrosVentasPeriodo, Rango } from './reportes.schemas.js';

/*
    Lo que la API agrega a los reportes:
    - Caché (D78): 5 minutos y 200 entradas como máximo. Cada aviso de negocio (venta,
      cancelación, cambio de estado, devolución, inventario, catálogo o parámetro) lo vacía, así
      el administrador no ve números anteriores a un cambio hecho por la API. Los datos son los
      mismos para todo administrador: la clave es el reporte y sus filtros, no el usuario.
      Los carritos abandonados no se cachean (dependen de cada carrito y se piden paginados).
    - Los documentos exportables (Excel y PDF) con los mismos datos que muestran los endpoints.
*/
const VIGENCIA_MS = 5 * 60 * 1000;
const MAXIMO_ENTRADAS = 200;

export interface Generado<T> {
    datos: T;
    desdeCache: boolean;
    generadoEn: string;
}

const AGRUPACION: Record<string, string> = { DIA: 'día', SEMANA: 'semana', MES: 'mes' };

export function crearServicioReportes(eventos: EventosNegocio) {
    const cache = new CacheMemoria<{ datos: unknown; generadoEn: string }>(VIGENCIA_MS, MAXIMO_ENTRADAS);
    // Una sola suscripción por app, de vida igual a la de la app.
    eventos.suscribir(() => {
        cache.invalidar();
    });

    async function cacheado<T>(clave: string, calcular: () => Promise<T>): Promise<Generado<T>> {
        const { valor, desdeCache } = await cache.obtener(clave, async () => ({
            datos: await calcular(),
            generadoEn: new Date().toISOString(),
        }));
        return { datos: valor.datos as T, desdeCache, generadoEn: valor.generadoEn };
    }

    const resumen = (idUsuario: number, r: Rango) =>
        cacheado(`resumen|${r.fechaDesde}|${r.fechaHasta}`, () => repositorio.resumen(idUsuario, r));
    const ventasPorPeriodo = (idUsuario: number, f: FiltrosVentasPeriodo) =>
        cacheado(`periodo|${f.agrupacion}|${f.fechaDesde}|${f.fechaHasta}`, () =>
            repositorio.ventasPorPeriodo(idUsuario, f),
        );
    const ventasPorCategoria = (idUsuario: number, r: Rango) =>
        cacheado(`categoria|${r.fechaDesde}|${r.fechaHasta}`, () => repositorio.ventasPorCategoria(idUsuario, r));
    const topProductos = (idUsuario: number, r: Rango) =>
        cacheado(`top|${r.fechaDesde}|${r.fechaHasta}`, () => repositorio.topProductos(idUsuario, r));

    return {
        resumen,
        ventasPorPeriodo,
        ventasPorCategoria,
        topProductos,
        /** Para las pruebas y el diagnóstico. */
        entradasEnCache: () => cache.tamano,

        /** Reporte de ventas completo: los mismos datos (y el mismo caché) que los endpoints. */
        async documentoVentas(idUsuario: number, f: FiltrosVentasPeriodo): Promise<Documento> {
            const [r, periodos, categorias, top] = await Promise.all([
                resumen(idUsuario, f),
                ventasPorPeriodo(idUsuario, f),
                ventasPorCategoria(idUsuario, f),
                topProductos(idUsuario, f),
            ]);
            const existencias = await paginado((pagina, tamanoPagina) =>
                listarExistencias(idUsuario, {
                    pagina,
                    tamanoPagina,
                    soloExistenciaBaja: true,
                    ordenarPor: 'PRODUCTO',
                    direccion: 'ASC',
                }),
            );
            const d = r.datos;
            return {
                titulo: 'ShopCart · Reporte de ventas',
                subtitulo: `Del ${f.fechaDesde} al ${f.fechaHasta} (días de Guatemala) · generado ${r.generadoEn}`,
                indicadores: [
                    { etiqueta: 'Ventas netas', valor: d.ventaNeta, tipo: 'moneda' },
                    { etiqueta: 'Pedidos', valor: d.pedidos, tipo: 'entero' },
                    { etiqueta: 'Ticket promedio', valor: d.ticketPromedio, tipo: 'moneda' },
                    { etiqueta: 'Unidades vendidas', valor: d.unidades, tipo: 'entero' },
                    { etiqueta: 'Monto devuelto', valor: d.montoDevuelto, tipo: 'moneda' },
                    { etiqueta: 'Carritos abandonados', valor: d.carritosAbandonados, tipo: 'entero' },
                    { etiqueta: 'Valor de carritos abandonados', valor: d.valorCarritosAbandonados, tipo: 'moneda' },
                    {
                        etiqueta: 'Variantes con existencia baja (hoy)',
                        valor: d.variantesExistenciaBaja,
                        tipo: 'entero',
                    },
                ],
                secciones: [
                    {
                        titulo: `Ventas por ${AGRUPACION[f.agrupacion] ?? f.agrupacion}`,
                        columnas: [
                            { titulo: 'Periodo', clave: 'periodo', tipo: 'dia', ancho: 14 },
                            { titulo: 'Desde', clave: 'desde', tipo: 'dia', ancho: 14 },
                            { titulo: 'Hasta', clave: 'hasta', tipo: 'dia', ancho: 14 },
                            { titulo: 'Pedidos', clave: 'pedidos', tipo: 'entero', ancho: 10 },
                            { titulo: 'Venta neta', clave: 'ventaNeta', tipo: 'moneda', ancho: 16 },
                        ],
                        filas: periodos.datos,
                    },
                    {
                        titulo: 'Ventas por categoría',
                        columnas: [
                            { titulo: 'Categoría', clave: 'categoria', ancho: 30 },
                            { titulo: 'Unidades', clave: 'unidades', tipo: 'entero', ancho: 10 },
                            { titulo: 'Venta neta', clave: 'ventaNeta', tipo: 'moneda', ancho: 16 },
                            { titulo: '% del total', clave: 'porcentaje', tipo: 'porcentaje', ancho: 12 },
                        ],
                        filas: categorias.datos,
                    },
                    {
                        titulo: 'Top 10 productos',
                        columnas: [
                            { titulo: '#', clave: 'posicion', tipo: 'entero', ancho: 5 },
                            { titulo: 'Producto', clave: 'producto', ancho: 36 },
                            { titulo: 'Categoría', clave: 'categoria', ancho: 20 },
                            { titulo: 'Unidades', clave: 'unidades', tipo: 'entero', ancho: 10 },
                            { titulo: 'Venta neta', clave: 'ventaNeta', tipo: 'moneda', ancho: 16 },
                        ],
                        filas: top.datos,
                    },
                    {
                        titulo: 'Existencia baja',
                        columnas: [
                            { titulo: 'SKU', clave: 'sku', ancho: 16 },
                            { titulo: 'Producto', clave: 'producto', ancho: 32 },
                            { titulo: 'Variante', clave: 'descripcion', ancho: 20 },
                            { titulo: 'Física', clave: 'existenciaFisica', tipo: 'entero', ancho: 9 },
                            { titulo: 'Reservada', clave: 'reservado', tipo: 'entero', ancho: 10 },
                            { titulo: 'Disponible', clave: 'disponible', tipo: 'entero', ancho: 10 },
                        ],
                        filas: existencias.filas,
                        nota: existencias.nota,
                    },
                ],
            };
        },

        async documentoCarritos(idUsuario: number, f: FiltrosCarritos): Promise<Documento> {
            const carritos = await paginado((pagina, tamano) =>
                repositorio.carritosAbandonados(idUsuario, f, pagina, tamano),
            );
            const rango =
                f.fechaDesde || f.fechaHasta
                    ? `Última actividad del ${f.fechaDesde ?? 'inicio'} al ${f.fechaHasta ?? 'hoy'}`
                    : 'Todos';
            return {
                titulo: 'ShopCart · Carritos abandonados',
                subtitulo: `${rango} · ${String(carritos.total)} carritos · generado ${new Date().toISOString()}`,
                secciones: [
                    {
                        titulo: 'Carritos abandonados',
                        columnas: [
                            { titulo: 'Carrito', clave: 'idCarrito', tipo: 'entero', ancho: 9 },
                            { titulo: 'Cliente', clave: 'cliente', ancho: 22 },
                            { titulo: 'Correo', clave: 'correo', ancho: 28 },
                            { titulo: 'Invitado', clave: 'esInvitado', tipo: 'booleano', ancho: 9 },
                            { titulo: 'Última actividad', clave: 'fechaUltimaActividad', tipo: 'fechaHora', ancho: 18 },
                            { titulo: 'Horas', clave: 'horasInactivo', tipo: 'entero', ancho: 8 },
                            { titulo: 'Artículos', clave: 'articulos', tipo: 'entero', ancho: 9 },
                            { titulo: 'Valor', clave: 'valor', tipo: 'moneda', ancho: 13 },
                            { titulo: 'Cupón', clave: 'codigoCupon', ancho: 12 },
                        ],
                        filas: carritos.filas,
                        nota: carritos.nota,
                    },
                ],
            };
        },
    };
}

export type ServicioReportes = ReturnType<typeof crearServicioReportes>;
export type { Fila };
