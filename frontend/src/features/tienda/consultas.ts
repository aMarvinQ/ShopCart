import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../api/cliente';

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
export const TAMANO_PAGINA = 24;
/* Tope de lo que una búsqueda guarda en memoria: pasado esto se pide afinar los filtros. */
export const MAXIMO_PAGINAS = 20;

export function useCategorias() {
    return useQuery({
        queryKey: ['tienda', 'categorias'],
        queryFn: ({ signal }) => api.get('/tienda/categorias', { signal }),
        staleTime: CINCO_MINUTOS,
    });
}

/** Una tanda de productos para una fila; no consulta hasta que `activa` es true. */
export function useFilaProductos(filtros: FiltrosProductos, tamano: number, activa: boolean) {
    return useQuery({
        queryKey: ['tienda', 'fila', filtros, tamano],
        queryFn: ({ signal }) =>
            api.get('/tienda/productos', { query: { ...filtros, pagina: 1, tamanoPagina: tamano }, signal }),
        enabled: activa,
        staleTime: 60_000,
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
        staleTime: 60_000,
    });
}

export const consultaDetalle = (slug: string) => ({
    queryKey: ['tienda', 'producto', slug],
    queryFn: ({ signal }: { signal: AbortSignal }) => api.get('/tienda/productos/{slug}', { params: { slug }, signal }),
    staleTime: 60_000,
});
