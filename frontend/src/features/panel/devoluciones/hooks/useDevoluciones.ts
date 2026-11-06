import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';
import { textoRango } from '../../../../utils/calendario';
import { leerDia, rangoParaApi } from '../../../../utils/formato';
import { CLAVE_DEVOLUCIONES } from '../../pedidos/hooks/useGestionPedido';

export type FilaDevolucion = DatosDe<'get', '/devoluciones'>[number];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['FECHA', 'PEDIDO', 'MONTO'];
const ORDEN_INICIAL = { ordenarPor: 'FECHA', direccion: 'DESC' } as const;
const FILTROS = ['desde', 'hasta'] as const;

export const ORDENES_MOVIL = [
    { etiqueta: 'Más recientes', ordenarPor: 'FECHA', direccion: 'DESC' },
    { etiqueta: 'Más antiguas', ordenarPor: 'FECHA', direccion: 'ASC' },
    { etiqueta: 'Mayor monto', ordenarPor: 'MONTO', direccion: 'DESC' },
    { etiqueta: 'Menor monto', ordenarPor: 'MONTO', direccion: 'ASC' },
    { etiqueta: 'Por pedido', ordenarPor: 'PEDIDO', direccion: 'DESC' },
] as const;

/** Historial de devoluciones: fechas, orden y página en la URL; la API resuelve todo. */
export function useDevoluciones() {
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrarVarios, limpiarFiltros } =
        useParametrosTabla({
            columnas: COLUMNAS,
            ordenPorDefecto: ORDEN_INICIAL,
            filtros: FILTROS,
        });
    const desde = leerDia(filtros.desde);
    const hasta = leerDia(filtros.hasta);

    const consulta = useQuery({
        queryKey: [...CLAVE_DEVOLUCIONES, { pagina, orden, desde, hasta }],
        queryFn: ({ signal }) =>
            api.get('/devoluciones', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...rangoParaApi(filtros.desde, filtros.hasta),
                },
                signal,
            }),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });

    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        desde,
        hasta,
        hayFiltros: desde !== null || hasta !== null,
        rango: textoRango(desde, hasta),
        irAPagina,
        ordenar,
        fijarOrden,
        limpiarFiltros,
        elegirFechas: (primero: string, ultimo: string) => {
            filtrarVarios({ desde: primero, hasta: ultimo });
        },
        quitarFechas: () => {
            filtrarVarios({ desde: '', hasta: '' });
        },
    };
}
