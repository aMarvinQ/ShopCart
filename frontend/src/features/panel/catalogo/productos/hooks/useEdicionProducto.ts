import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../../../../api/cliente';
import { useAvisos } from '../../../../../ui/avisos/contexto';
import { useAvisoSalida } from '../../../../../ui/useAvisoSalida';
import { aplicarErroresApi } from '../../../../../utils/formularios';
import { CLAVE_INVENTARIO } from '../../../pedidos/hooks/useGestionPedido';
import { CLAVE_CATEGORIAS } from '../../hooks/useCategoriasPanel';
import { CLAVE_PRODUCTOS } from './useProductosPanel';

export type Producto = DatosDe<'get', '/productos/{id}'>;
export type Variante = Producto['variantes'][number];
export type ImagenProductoAdmin = Producto['imagenes'][number];

export const claveDetalle = (id: number) => [...CLAVE_PRODUCTOS, 'detalle', id];

export function useProducto(id: number) {
    return useQuery({
        queryKey: claveDetalle(id),
        queryFn: ({ signal }) => api.get('/productos/{id}', { params: { id }, signal }),
    });
}

/**
 * Cambio sobre un producto. Todas las rutas responden con el producto completo: esa respuesta se muestra
 * y trae las versiones nuevas. Si falla (otra persona lo cambió, una regla de la API) se avisa y se recarga.
 */
export function useCambioProducto<V>(
    idProducto: number,
    cambiar: (variables: V) => Promise<{ data: Producto }>,
    { exito, error: tituloError }: { exito?: string | ((variables: V, producto: Producto) => string); error?: string },
) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    return useMutation({
        mutationFn: cambiar,
        onSuccess: async (respuesta, variables) => {
            consultas.setQueryData(claveDetalle(idProducto), respuesta);
            if (exito) {
                avisar({ tipo: 'exito', titulo: typeof exito === 'string' ? exito : exito(variables, respuesta.data) });
            }
            await consultas.invalidateQueries({ queryKey: CLAVE_PRODUCTOS, refetchType: 'none' });
            await consultas.invalidateQueries({ queryKey: CLAVE_INVENTARIO });
        },
        onError: async (error) => {
            // Sin título, quien llama muestra el error junto a sus campos.
            if (tituloError) avisar({ tipo: 'error', titulo: tituloError, detalle: error.message });
            await consultas.invalidateQueries({ queryKey: claveDetalle(idProducto) });
        },
    });
}

const esquemaGeneral = z.object({
    nombre: z.string().trim().min(1, 'Escribe el nombre.').max(200, 'Máximo 200 caracteres.'),
    slug: z
        .string()
        .trim()
        .min(1, 'Escribe la dirección.')
        .max(220, 'Máximo 220 caracteres.')
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones.'),
    descripcion: z.string().trim().max(4000, 'Máximo 4000 caracteres.'),
    idCategoria: z.string().min(1, 'Elige la categoría.'),
});
type DatosGeneral = z.infer<typeof esquemaGeneral>;

const valoresDe = (producto: Producto): DatosGeneral => ({
    nombre: producto.nombre,
    slug: producto.slug,
    descripcion: producto.descripcion ?? '',
    idCategoria: String(producto.idCategoria),
});

/** Pestaña General: los cambios se guardan juntos desde la barra, y salir sin guardar pide confirmación. */
export function useGeneralProducto(producto: Producto) {
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const [porDesactivar, setPorDesactivar] = useState(false);
    const formulario = useForm<DatosGeneral>({
        resolver: zodResolver(esquemaGeneral),
        values: valoresDe(producto),
        resetOptions: { keepDirtyValues: true },
    });
    const { isDirty } = formulario.formState;
    const aviso = useAvisoSalida(isDirty);

    const categorias = useQuery({
        queryKey: CLAVE_CATEGORIAS,
        queryFn: ({ signal }) => api.get('/categorias', { signal }),
    });

    const guardar = useCambioProducto(
        producto.idProducto,
        ({ nombre, slug, descripcion, idCategoria }: DatosGeneral) =>
            api.put('/productos/{id}', {
                params: { id: producto.idProducto },
                cuerpo: {
                    idCategoria: Number(idCategoria),
                    nombre,
                    slug,
                    descripcion: descripcion || null,
                    versionFila: producto.versionFila,
                },
            }),
        { exito: 'Producto actualizado' },
    );

    const cambiarEstado = useCambioProducto(
        producto.idProducto,
        (activo: boolean) =>
            api.patch('/productos/{id}/estado', { params: { id: producto.idProducto }, cuerpo: { activo } }),
        {
            exito: (activo) => (activo ? 'Producto visible en la tienda' : 'Producto oculto'),
            error: 'No se pudo cambiar el estado',
        },
    );

    /* El SP exige imagen y variante activa para mostrar el producto. */
    const motivoNoVisible = producto.activo
        ? null
        : producto.imagenes.length === 0
          ? 'Para mostrarlo necesita al menos una imagen.'
          : producto.variantes.some((v) => v.activo)
            ? null
            : 'Para mostrarlo necesita al menos una variante activa.';

    return {
        motivoNoVisible,
        formulario,
        errorGeneral,
        hayCambios: isDirty,
        guardando: guardar.isPending,
        aviso,
        opcionesCategoria: (categorias.data?.data ?? [])
            .filter((c) => c.activo || c.idCategoria === producto.idCategoria)
            .map((c) => ({ valor: String(c.idCategoria), etiqueta: c.nombre })),
        descartar: () => {
            setErrorGeneral(null);
            formulario.reset(valoresDe(producto), { keepDirtyValues: false });
        },
        enviar: formulario.handleSubmit(async (datos) => {
            setErrorGeneral(null);
            try {
                const { data } = await guardar.mutateAsync(datos);
                formulario.reset(valoresDe(data), { keepDirtyValues: false });
            } catch (error) {
                setErrorGeneral(
                    aplicarErroresApi(
                        error,
                        formulario.setError,
                        ['nombre', 'slug', 'descripcion'],
                        'No se pudo guardar el producto.',
                        '',
                        { SLUG_REGISTRADO: 'slug' },
                    ),
                );
            }
        }),
        cambiando: cambiarEstado.isPending,
        porDesactivar,
        alternarVisible: () => {
            if (producto.activo) setPorDesactivar(true);
            else cambiarEstado.mutate(true);
        },
        desistir: () => {
            setPorDesactivar(false);
        },
        confirmarDesactivar: () => {
            cambiarEstado.mutate(false, {
                onSettled: () => {
                    setPorDesactivar(false);
                },
            });
        },
    };
}
