import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../../utils/formularios';
import { aSlug } from '../../../../utils/slug';
import { useAtributosPanel } from './useAtributosPanel';

export type Categoria = DatosDe<'get', '/categorias'>[number];

export const CLAVE_CATEGORIAS = ['panel', 'catalogo', 'categorias'];

const esquema = z.object({
    nombre: z.string().trim().min(1, 'Escribe el nombre.').max(100, 'Máximo 100 caracteres.'),
    slug: z
        .string()
        .trim()
        .min(1, 'Escribe la dirección.')
        .max(120, 'Máximo 120 caracteres.')
        .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Usa minúsculas, números y guiones.'),
    descripcion: z.string().trim().max(500, 'Máximo 500 caracteres.'),
});
type Datos = z.infer<typeof esquema>;

/** La lista completa cabe en memoria: son pocas categorías, y la búsqueda se hace aquí. */
export function useCategoriasPanel() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [busqueda, setBusqueda] = useState('');
    const [porDesactivar, setPorDesactivar] = useState<Categoria | null>(null);
    const consulta = useQuery({
        queryKey: CLAVE_CATEGORIAS,
        queryFn: ({ signal }) => api.get('/categorias', { signal }),
    });
    const filas = useMemo(() => {
        const texto = busqueda.toLocaleLowerCase('es');
        return consulta.data?.data.filter((c) => `${c.nombre} ${c.slug}`.toLocaleLowerCase('es').includes(texto));
    }, [consulta.data, busqueda]);

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
            api.patch('/categorias/{id}/estado', { params: { id }, cuerpo: { activo } }),
        onSuccess: ({ data }) => {
            avisar({
                tipo: 'exito',
                titulo: data.activo ? 'Categoría activada' : 'Categoría desactivada',
                detalle: data.nombre,
            });
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo cambiar el estado', detalle: error.message });
        },
        onSettled: async () => {
            setPorDesactivar(null);
            await consultas.invalidateQueries({ queryKey: CLAVE_CATEGORIAS });
        },
    });

    return {
        consulta,
        filas,
        busqueda,
        buscar: setBusqueda,
        porDesactivar,
        cambiando: cambiarEstado.isPending,
        /** Activar es inmediato; desactivar pide confirmación porque oculta sus productos en la tienda. */
        alternar: (categoria: Categoria) => {
            if (categoria.activo) setPorDesactivar(categoria);
            else cambiarEstado.mutate({ id: categoria.idCategoria, activo: true });
        },
        desistir: () => {
            setPorDesactivar(null);
        },
        confirmarDesactivar: () => {
            if (porDesactivar) cambiarEstado.mutate({ id: porDesactivar.idCategoria, activo: false });
        },
    };
}

export function useDetalleCategoria(id: number | null) {
    return useQuery({
        queryKey: [...CLAVE_CATEGORIAS, id],
        queryFn: ({ signal }) => api.get('/categorias/{id}', { params: { id: id ?? 0 }, signal }),
        enabled: id !== null,
        staleTime: 0,
    });
}

/**
 * Crear o editar. Datos y atributos son dos rutas de la API: si lo segundo falla, lo primero ya quedó
 * guardado, así que se avisa y se cierra en lugar de arriesgar una categoría duplicada al reintentar.
 */
export function useFormularioCategoria(categoria: Categoria | null, alTerminar: () => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const [slugEditado, setSlugEditado] = useState(categoria !== null);
    const iniciales = useMemo(
        () => [...(categoria?.atributos ?? [])].sort((a, b) => a.orden - b.orden).map((a) => a.idAtributo),
        [categoria],
    );
    const [elegidos, setElegidos] = useState<number[]>(iniciales);
    const { consulta: consultaAtributos } = useAtributosPanel();
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        defaultValues: {
            nombre: categoria?.nombre ?? '',
            slug: categoria?.slug ?? '',
            descripcion: categoria?.descripcion ?? '',
        },
    });

    const guardar = useMutation({
        mutationFn: async ({ nombre, slug, descripcion }: Datos) => {
            const cuerpo = { nombre, slug, descripcion: descripcion || null };
            const { data } = categoria
                ? await api.put('/categorias/{id}', {
                      params: { id: categoria.idCategoria },
                      cuerpo: { ...cuerpo, versionFila: categoria.versionFila ?? '' },
                  })
                : await api.post('/categorias', { cuerpo });
            if (elegidos.join() === iniciales.join()) return { data, atributosGuardados: true };
            try {
                await api.put('/categorias/{id}/atributos', {
                    params: { id: data.idCategoria },
                    cuerpo: { atributos: elegidos.map((idAtributo, orden) => ({ idAtributo, orden })) },
                });
                return { data, atributosGuardados: true };
            } catch (error) {
                avisar({
                    tipo: 'aviso',
                    titulo: 'La categoría se guardó, pero sus atributos no',
                    detalle: error instanceof Error ? error.message : 'Ábrela de nuevo para asignarlos.',
                });
                return { data, atributosGuardados: false };
            }
        },
        onSuccess: async ({ atributosGuardados }) => {
            if (atributosGuardados)
                avisar({ tipo: 'exito', titulo: categoria ? 'Categoría actualizada' : 'Categoría creada' });
            await consultas.invalidateQueries({ queryKey: CLAVE_CATEGORIAS });
            alTerminar();
        },
        onError: async (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    ['nombre', 'slug', 'descripcion'],
                    'No pudimos guardar la categoría; intenta de nuevo.',
                ),
            );
            await consultas.invalidateQueries({ queryKey: CLAVE_CATEGORIAS });
        },
    });

    return {
        formulario,
        errorGeneral,
        guardando: guardar.isPending,
        atributos: consultaAtributos.data?.data ?? [],
        elegidos,
        enUso: (idAtributo: number) => categoria?.atributos.find((a) => a.idAtributo === idAtributo)?.enUso === true,
        alternarAtributo: (idAtributo: number) => {
            setElegidos((actuales) =>
                actuales.includes(idAtributo) ? actuales.filter((id) => id !== idAtributo) : [...actuales, idAtributo],
            );
        },
        moverAtributo: (indice: number, sentido: 1 | -1) => {
            setElegidos((actuales) => {
                const copia = [...actuales];
                const [movido] = copia.splice(indice, 1);
                if (movido !== undefined) copia.splice(indice + sentido, 0, movido);
                return copia;
            });
        },
        /** La dirección sigue al nombre hasta que alguien la edita a mano. */
        alEscribirNombre: (nombre: string) => {
            if (!slugEditado)
                formulario.setValue('slug', aSlug(nombre), { shouldValidate: formulario.formState.isSubmitted });
        },
        alEditarSlug: () => {
            setSlugEditado(true);
        },
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            guardar.mutate(datos);
        }),
    };
}
