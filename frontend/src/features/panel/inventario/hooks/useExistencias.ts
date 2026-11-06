import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';
import { useCategorias } from '../../../tienda/hooks/useCatalogo';
import { CLAVE_INVENTARIO } from '../../pedidos/hooks/useGestionPedido';

export type FilaExistencia = DatosDe<'get', '/inventario/existencias'>[number];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['PRODUCTO', 'SKU', 'CATEGORIA', 'FISICA', 'RESERVADO', 'DISPONIBLE'];
const ORDEN_INICIAL = { ordenarPor: 'PRODUCTO', direccion: 'ASC' } as const;
const FILTROS = ['busqueda', 'categoria', 'estado'] as const;

export const ESTADOS_EXISTENCIA = [
    { valor: '', etiqueta: 'Todos los estados' },
    { valor: 'baja', etiqueta: 'Existencia baja' },
    { valor: 'agotadas', etiqueta: 'Agotadas' },
];

export const ORDENES_MOVIL = [
    { etiqueta: 'Producto: A a Z', ordenarPor: 'PRODUCTO', direccion: 'ASC' },
    { etiqueta: 'Menos disponibles', ordenarPor: 'DISPONIBLE', direccion: 'ASC' },
    { etiqueta: 'Más disponibles', ordenarPor: 'DISPONIBLE', direccion: 'DESC' },
    { etiqueta: 'SKU', ordenarPor: 'SKU', direccion: 'ASC' },
    { etiqueta: 'Categoría', ordenarPor: 'CATEGORIA', direccion: 'ASC' },
] as const;

/**
 * Hasta qué cantidad una variante cuenta como "baja". La regla (EXISTENCIA_MINIMA) solo la puede leer
 * un administrador, pero el filtro de la API la aplica para todos: la variante baja con más unidades
 * marca el límite real. Si un administrador cambia el parámetro, esto se ajusta solo.
 */
function useLimiteExistenciaBaja() {
    return useQuery({
        queryKey: [...CLAVE_INVENTARIO, 'limite-baja'],
        queryFn: ({ signal }) =>
            api.get('/inventario/existencias', {
                query: {
                    pagina: 1,
                    tamanoPagina: 1,
                    soloExistenciaBaja: 'true',
                    ordenarPor: 'DISPONIBLE',
                    direccion: 'DESC',
                },
                signal,
            }),
        select: ({ data }) => data[0]?.disponible ?? null,
        staleTime: 30_000,
    });
}

export type EstadoExistencia = 'agotado' | 'bajo' | 'disponible' | 'fuera-de-venta';

export function estadoDeExistencia(fila: FilaExistencia, limite: number | null | undefined): EstadoExistencia {
    if (!fila.activo || !fila.productoActivo) return 'fuera-de-venta';
    if (fila.disponible === 0) return 'agotado';
    return limite !== null && limite !== undefined && fila.disponible <= limite ? 'bajo' : 'disponible';
}

export function useExistencias() {
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, limpiarFiltros } = useParametrosTabla({
        columnas: COLUMNAS,
        ordenPorDefecto: ORDEN_INICIAL,
        filtros: FILTROS,
    });
    const busqueda = filtros.busqueda.trim().slice(0, 100);
    const idCategoria = Number(filtros.categoria);
    const categoriaValida = Number.isSafeInteger(idCategoria) && idCategoria > 0;
    const limite = useLimiteExistenciaBaja();
    const categorias = useCategorias().data?.data ?? [];

    const consulta = useQuery({
        queryKey: [
            ...CLAVE_INVENTARIO,
            'existencias',
            { pagina, orden, busqueda, categoria: filtros.categoria, estado: filtros.estado },
        ],
        queryFn: ({ signal }) =>
            api.get('/inventario/existencias', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...(busqueda && { busqueda }),
                    ...(categoriaValida && { idCategoria }),
                    ...(filtros.estado === 'baja' && { soloExistenciaBaja: 'true' as const }),
                    ...(filtros.estado === 'agotadas' && { soloAgotadas: 'true' as const }),
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
        busqueda,
        categoria: categoriaValida ? filtros.categoria : '',
        estado: ESTADOS_EXISTENCIA.some((e) => e.valor === filtros.estado) ? filtros.estado : '',
        opcionesCategoria: [
            { valor: '', etiqueta: 'Todas las categorías' },
            ...categorias.map((c) => ({ valor: String(c.idCategoria), etiqueta: c.nombre })),
        ],
        hayFiltros: busqueda !== '' || categoriaValida || filtros.estado !== '',
        limiteBajo: limite.data,
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
    };
}
