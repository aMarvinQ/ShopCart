import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DatosDe } from '../../../../../api/cliente';
import { useAvisos } from '../../../../../ui/avisos/contexto';
import { useParametrosTabla } from '../../../../../ui/useParametrosTabla';
import { CLAVE_CATEGORIAS } from '../../hooks/useCategoriasPanel';

export type FilaProducto = DatosDe<'get', '/productos'>[number];

export const CLAVE_PRODUCTOS = ['panel', 'catalogo', 'productos'];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['MODIFICACION', 'NOMBRE', 'CATEGORIA', 'PRECIO', 'EXISTENCIA'];
const ORDEN_INICIAL = { ordenarPor: 'MODIFICACION', direccion: 'DESC' } as const;
const FILTROS = ['busqueda', 'categoria', 'estado'] as const;

export const ESTADOS_PRODUCTO = [
    { valor: '', etiqueta: 'Todos los estados' },
    { valor: 'true', etiqueta: 'Activos' },
    { valor: 'false', etiqueta: 'Inactivos' },
];

export const ORDENES_MOVIL = [
    { etiqueta: 'Modificados hace poco', ordenarPor: 'MODIFICACION', direccion: 'DESC' },
    { etiqueta: 'Nombre: A a Z', ordenarPor: 'NOMBRE', direccion: 'ASC' },
    { etiqueta: 'Menor precio', ordenarPor: 'PRECIO', direccion: 'ASC' },
    { etiqueta: 'Mayor precio', ordenarPor: 'PRECIO', direccion: 'DESC' },
    { etiqueta: 'Menos existencia', ordenarPor: 'EXISTENCIA', direccion: 'ASC' },
] as const;

export function useProductosPanel() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [porDesactivar, setPorDesactivar] = useState<FilaProducto | null>(null);
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, limpiarFiltros } = useParametrosTabla({
        columnas: COLUMNAS,
        ordenPorDefecto: ORDEN_INICIAL,
        filtros: FILTROS,
    });
    const busqueda = filtros.busqueda.trim().slice(0, 100);
    const idCategoria = Number(filtros.categoria);
    const categoriaValida = Number.isSafeInteger(idCategoria) && idCategoria > 0;
    const estado = filtros.estado === 'true' || filtros.estado === 'false' ? filtros.estado : undefined;

    const categorias = useQuery({
        queryKey: CLAVE_CATEGORIAS,
        queryFn: ({ signal }) => api.get('/categorias', { signal }),
    });

    const consulta = useQuery({
        queryKey: [...CLAVE_PRODUCTOS, { pagina, orden, busqueda, categoria: filtros.categoria, estado }],
        queryFn: ({ signal }) =>
            api.get('/productos', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...(busqueda && { busqueda }),
                    ...(categoriaValida && { idCategoria }),
                    ...(estado && { activo: estado }),
                },
                signal,
            }),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
            api.patch('/productos/{id}/estado', { params: { id }, cuerpo: { activo } }),
        onSuccess: ({ data }) => {
            avisar({
                tipo: 'exito',
                titulo: data.activo ? 'Producto activado' : 'Producto desactivado',
                detalle: data.nombre,
            });
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo cambiar el estado', detalle: error.message });
        },
        onSettled: async () => {
            setPorDesactivar(null);
            await consultas.invalidateQueries({ queryKey: CLAVE_PRODUCTOS });
        },
    });

    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        busqueda,
        categoria: categoriaValida ? filtros.categoria : '',
        estado: estado ?? '',
        opcionesCategoria: [
            { valor: '', etiqueta: 'Todas las categorías' },
            ...(categorias.data?.data ?? []).map((c) => ({ valor: String(c.idCategoria), etiqueta: c.nombre })),
        ],
        hayFiltros: busqueda !== '' || categoriaValida || estado !== undefined,
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
        porDesactivar,
        cambiando: cambiarEstado.isPending,
        /** Activar es inmediato (la API exige imagen y variante activa); desactivar lo saca de la tienda: se confirma. */
        alternar: (producto: FilaProducto) => {
            if (producto.activo) setPorDesactivar(producto);
            else cambiarEstado.mutate({ id: producto.idProducto, activo: true });
        },
        desistir: () => {
            setPorDesactivar(null);
        },
        confirmarDesactivar: () => {
            if (porDesactivar) cambiarEstado.mutate({ id: porDesactivar.idProducto, activo: false });
        },
    };
}
