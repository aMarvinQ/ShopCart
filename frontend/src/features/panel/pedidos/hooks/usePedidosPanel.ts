import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { textoRango } from '../../../../utils/calendario';
import { finDelDia, inicioDelDia, leerDia } from '../../../../utils/formato';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';

export type FilaPedido = DatosDe<'get', '/pedidos'>[number];
type CodigoEstado = FilaPedido['codigoEstado'];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['FECHA', 'NUMERO', 'CLIENTE', 'TOTAL', 'ESTADO'];
const ORDEN_INICIAL = { ordenarPor: 'FECHA', direccion: 'DESC' } as const;
const FILTROS = ['busqueda', 'estado', 'desde', 'hasta'] as const;

export const TODOS_LOS_ESTADOS = 'TODOS';

export const ORDENES_MOVIL = [
    { etiqueta: 'Más recientes', ordenarPor: 'FECHA', direccion: 'DESC' },
    { etiqueta: 'Más antiguos', ordenarPor: 'FECHA', direccion: 'ASC' },
    { etiqueta: 'Mayor total', ordenarPor: 'TOTAL', direccion: 'DESC' },
    { etiqueta: 'Menor total', ordenarPor: 'TOTAL', direccion: 'ASC' },
    { etiqueta: 'Cliente: A a Z', ordenarPor: 'CLIENTE', direccion: 'ASC' },
    { etiqueta: 'Por estado', ordenarPor: 'ESTADO', direccion: 'ASC' },
    { etiqueta: 'Por número', ordenarPor: 'NUMERO', direccion: 'DESC' },
] as const;

export const PESTANAS_ESTADO: readonly { valor: CodigoEstado | typeof TODOS_LOS_ESTADOS; etiqueta: string }[] = [
    { valor: TODOS_LOS_ESTADOS, etiqueta: 'Todos' },
    { valor: 'PAGADO', etiqueta: 'Pagado' },
    { valor: 'EN_PREPARACION', etiqueta: 'En preparación' },
    { valor: 'ENVIADO', etiqueta: 'Enviado' },
    { valor: 'ENTREGADO', etiqueta: 'Entregado' },
    { valor: 'CANCELADO', etiqueta: 'Cancelado' },
    { valor: 'DEVUELTO_PARCIAL', etiqueta: 'Devuelto parcial' },
    { valor: 'DEVUELTO', etiqueta: 'Devuelto' },
];

const estadoValido = (valor: string): CodigoEstado | undefined =>
    PESTANAS_ESTADO.find(
        (p): p is { valor: CodigoEstado; etiqueta: string } => p.valor === valor && valor !== TODOS_LOS_ESTADOS,
    )?.valor;

/** Con las fechas al revés se ordenan: quien las escribió quiso ese rango, no un error. */
function rangoDeFechas(desde: string, hasta: string) {
    const [inicio, fin] = [leerDia(desde), leerDia(hasta)];
    const invertido = inicio !== null && fin !== null && inicio > fin;
    const primero = invertido ? fin : inicio;
    const ultimo = invertido ? inicio : fin;
    return {
        ...(primero && { fechaDesde: inicioDelDia(primero) }),
        ...(ultimo && { fechaHasta: finDelDia(ultimo) }),
    };
}

/**
 * Cuántos pedidos hay en cada estado con los filtros actuales. La API no tiene un conteo por estado:
 * se pide cada lista con un solo registro y se lee su total. Se guarda 30 s para no repetir consultas.
 */
function useConteosPorEstado(busqueda: string, desde: string, hasta: string) {
    return useQueries({
        queries: PESTANAS_ESTADO.map(({ valor }) => ({
            queryKey: ['panel', 'pedidos', 'conteo', { valor, busqueda, desde, hasta }],
            queryFn: ({ signal }: { signal: AbortSignal }) =>
                api.get('/pedidos', {
                    query: {
                        pagina: 1,
                        tamanoPagina: 1,
                        ...(valor !== TODOS_LOS_ESTADOS && { estado: valor }),
                        ...(busqueda && { busqueda }),
                        ...rangoDeFechas(desde, hasta),
                    },
                    signal,
                }),
            placeholderData: keepPreviousData,
            staleTime: 30_000,
        })),
    }).map((conteo) => conteo.data?.meta.totalRegistros);
}

/** Lista de pedidos del panel: filtros, orden y página en la URL; la API resuelve todo. */
export function usePedidosPanel() {
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, filtrarVarios, limpiarFiltros } =
        useParametrosTabla({
            columnas: COLUMNAS,
            ordenPorDefecto: ORDEN_INICIAL,
            filtros: FILTROS,
        });
    const estado = estadoValido(filtros.estado);
    const busqueda = filtros.busqueda.trim().slice(0, 100);

    const conteos = useConteosPorEstado(busqueda, filtros.desde, filtros.hasta);
    const desde = leerDia(filtros.desde);
    const hasta = leerDia(filtros.hasta);

    const consulta = useQuery({
        queryKey: ['panel', 'pedidos', { pagina, orden, estado, busqueda, desde: filtros.desde, hasta: filtros.hasta }],
        queryFn: ({ signal }) =>
            api.get('/pedidos', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...(estado && { estado }),
                    ...(busqueda && { busqueda }),
                    ...rangoDeFechas(filtros.desde, filtros.hasta),
                },
                signal,
            }),
        // Al cambiar de página o filtro se conservan las filas anteriores (atenuadas): la tabla no salta.
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });

    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        estado: estado ?? TODOS_LOS_ESTADOS,
        estados: PESTANAS_ESTADO.map((p, i) => ({ ...p, conteo: conteos[i] ?? null })),
        busqueda,
        desde,
        hasta,
        rango: textoRango(desde, hasta),
        elegirEstado: (valor: string) => {
            filtrar('estado', valor === TODOS_LOS_ESTADOS ? '' : valor);
        },
        elegirFechas: (primero: string, ultimo: string) => {
            filtrarVarios({ desde: primero, hasta: ultimo });
        },
        quitarFechas: () => {
            filtrarVarios({ desde: '', hasta: '' });
        },
        hayFiltros: estado !== undefined || busqueda !== '' || filtros.desde !== '' || filtros.hasta !== '',
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
    };
}
