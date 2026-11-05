import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../api/cliente';

export type TarjetaDeProducto = DatosDe<'get', '/tienda/productos'>[number];
export type DetalleDeProducto = DatosDe<'get', '/tienda/productos/{slug}'>;
export type VarianteDeProducto = DetalleDeProducto['variantes'][number];

export interface FiltrosProductos {
    texto?: string;
    categoria?: string;
    precioMinimo?: number;
    precioMaximo?: number;
    soloDisponibles?: 'true';
    ordenarPor?: 'RECIENTES' | 'NOMBRE' | 'PRECIO';
    direccion?: 'ASC' | 'DESC';
}

const CINCO_MINUTOS = 5 * 60_000;
const UN_MINUTO = 60_000;
const TAMANO_PAGINA = 24;
/* Tope de lo que una búsqueda guarda en memoria: pasado esto se pide afinar los filtros. */
export const MAXIMO_PAGINAS = 20;
const CATEGORIAS_EN_INICIO = 3;

export function useCategorias() {
    return useQuery({
        queryKey: ['tienda', 'categorias'],
        queryFn: ({ signal }) => api.get('/tienda/categorias', { signal }),
        staleTime: CINCO_MINUTOS,
    });
}

/** Las categorías con más productos, para la portada. */
export function useCategoriasDestacadas() {
    const { data, isPending } = useCategorias();
    const categorias = [...(data?.data ?? [])]
        .sort((a, b) => b.productosVisibles - a.productosVisibles)
        .slice(0, CATEGORIAS_EN_INICIO);
    return { categorias, cargando: isPending };
}

/** Una tanda de productos para una fila; no consulta hasta que `activa` es true. */
export function useFilaProductos(filtros: FiltrosProductos, tamano: number, activa: boolean) {
    return useQuery({
        queryKey: ['tienda', 'fila', filtros, tamano],
        queryFn: ({ signal }) =>
            api.get('/tienda/productos', { query: { ...filtros, pagina: 1, tamanoPagina: tamano }, signal }),
        enabled: activa,
        staleTime: UN_MINUTO,
    });
}

export function useBusquedaProductos(filtros: FiltrosProductos) {
    return useInfiniteQuery({
        queryKey: ['tienda', 'busqueda', filtros],
        initialPageParam: 1,
        queryFn: ({ pageParam, signal }) =>
            api.get('/tienda/productos', {
                query: { ...filtros, pagina: pageParam, tamanoPagina: TAMANO_PAGINA },
                signal,
            }),
        getNextPageParam: ({ meta }) =>
            meta.pagina * meta.tamanoPagina < meta.totalRegistros && meta.pagina < MAXIMO_PAGINAS
                ? meta.pagina + 1
                : undefined,
        staleTime: UN_MINUTO,
    });
}

export function useDetalleProducto(slug: string) {
    return useQuery({
        queryKey: ['tienda', 'producto', slug],
        queryFn: ({ signal }) => api.get('/tienda/productos/{slug}', { params: { slug }, signal }),
        staleTime: UN_MINUTO,
    });
}

export function useMetodosEnvio() {
    return useQuery({
        queryKey: ['tienda', 'metodos-envio'],
        queryFn: ({ signal }) => api.get('/tienda/metodos-envio', { signal }),
        staleTime: CINCO_MINUTOS,
    });
}
