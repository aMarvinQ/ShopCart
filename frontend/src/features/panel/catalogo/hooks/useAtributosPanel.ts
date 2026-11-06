import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../../utils/formularios';

export type Atributo = DatosDe<'get', '/atributos'>[number];
export type ValorAtributo = Atributo['valores'][number];

const CLAVE = ['panel', 'catalogo', 'atributos'];

const esquemaNombre = z.object({
    nombre: z.string().trim().min(1, 'Escribe el nombre.').max(50, 'Máximo 50 caracteres.'),
});
type DatosNombre = z.infer<typeof esquemaNombre>;

export function useAtributosPanel() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [busqueda, setBusqueda] = useState('');
    const [porDesactivar, setPorDesactivar] = useState<Atributo | null>(null);
    const consulta = useQuery({
        queryKey: CLAVE,
        queryFn: ({ signal }) => api.get('/atributos', { signal }),
    });
    const filas = useMemo(() => {
        const texto = busqueda.toLocaleLowerCase('es');
        return consulta.data?.data.filter((a) =>
            `${a.nombre} ${a.valores.map((v) => v.valor).join(' ')}`.toLocaleLowerCase('es').includes(texto),
        );
    }, [consulta.data, busqueda]);

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
            api.patch('/atributos/{id}/estado', { params: { id }, cuerpo: { activo } }),
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo cambiar el estado', detalle: error.message });
        },
        onSettled: async () => {
            setPorDesactivar(null);
            await consultas.invalidateQueries({ queryKey: CLAVE });
        },
    });

    return {
        consulta,
        filas,
        busqueda,
        buscar: setBusqueda,
        porDesactivar,
        cambiando: cambiarEstado.isPending,
        alternar: (atributo: Atributo) => {
            if (atributo.activo) setPorDesactivar(atributo);
            else cambiarEstado.mutate({ id: atributo.idAtributo, activo: true });
        },
        desistir: () => {
            setPorDesactivar(null);
        },
        confirmarDesactivar: () => {
            if (porDesactivar) cambiarEstado.mutate({ id: porDesactivar.idAtributo, activo: false });
        },
    };
}

/** Crea un valor; termina cuando la lista de atributos ya lo incluye. */
export function useNuevoValor() {
    const consultas = useQueryClient();
    return useMutation({
        mutationFn: ({
            idAtributo,
            valor,
            codigoHex,
        }: {
            idAtributo: number;
            valor: string;
            codigoHex: string | null;
        }) => api.post('/atributos/{id}/valores', { params: { id: idAtributo }, cuerpo: { valor, codigoHex } }),
        onSuccess: () => consultas.invalidateQueries({ queryKey: CLAVE }),
    });
}

/** Datos de un atributo y sus valores. Cada cambio de valor se guarda de inmediato y recarga la lista. */
export function useEdicionAtributo(idInicial: number | null, alCrear: (id: number) => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const id = idInicial;

    const detalle = useQuery({
        queryKey: [...CLAVE, id],
        queryFn: ({ signal }) => api.get('/atributos/{id}', { params: { id: id ?? 0 }, signal }),
        enabled: id !== null,
        staleTime: 0,
    });
    const atributo = detalle.data?.data;
    const valores = useMemo(() => [...(atributo?.valores ?? [])].sort((a, b) => a.orden - b.orden), [atributo]);

    const refrescar = () => consultas.invalidateQueries({ queryKey: CLAVE });
    const alFallar = (titulo: string) => (error: Error) => {
        avisar({ tipo: 'error', titulo, detalle: error.message });
    };

    const formulario = useForm<DatosNombre>({
        resolver: zodResolver(esquemaNombre),
        values: { nombre: atributo?.nombre ?? '' },
    });

    const guardarNombre = useMutation({
        mutationFn: ({ nombre }: DatosNombre) =>
            id === null
                ? api.post('/atributos', { cuerpo: { nombre } })
                : api.put('/atributos/{id}', { params: { id }, cuerpo: { nombre } }),
        onSuccess: async ({ data }) => {
            setErrorGeneral(null);
            avisar({ tipo: 'exito', titulo: id === null ? 'Atributo creado' : 'Atributo actualizado' });
            await refrescar();
            if (id === null) alCrear(data.idAtributo);
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(error, formulario.setError, ['nombre'], 'No pudimos guardar el atributo.'),
            );
        },
    });

    const agregarValor = useMutation({
        mutationFn: ({ valor, codigoHex }: { valor: string; codigoHex: string | null }) =>
            api.post('/atributos/{id}/valores', { params: { id: id ?? 0 }, cuerpo: { valor, codigoHex } }),
        onSuccess: refrescar,
    });

    const editarValor = useMutation({
        mutationFn: ({ valor, ...cuerpo }: { valor: ValorAtributo; codigoHex: string | null; texto: string }) =>
            api.put('/valores/{id}', {
                params: { id: valor.idAtributoValor },
                cuerpo: { valor: cuerpo.texto, codigoHex: cuerpo.codigoHex, orden: valor.orden },
            }),
        onSuccess: refrescar,
    });

    const estadoValor = useMutation({
        mutationFn: (valor: ValorAtributo) =>
            api.patch('/valores/{id}/estado', {
                params: { id: valor.idAtributoValor },
                cuerpo: { activo: !valor.activo },
            }),
        onSuccess: refrescar,
        onError: alFallar('No se pudo cambiar el valor'),
    });

    /* Mover es intercambiar el orden con el vecino: dos actualizaciones. Si una falla, se recarga lo real. */
    const moverValor = useMutation({
        mutationFn: async ({ indice, sentido }: { indice: number; sentido: 1 | -1 }) => {
            const [uno, otro] = [valores[indice], valores[indice + sentido]];
            if (!uno || !otro) return;
            const actualizar = (valor: ValorAtributo, orden: number) =>
                api.put('/valores/{id}', {
                    params: { id: valor.idAtributoValor },
                    cuerpo: { valor: valor.valor, codigoHex: valor.codigoHex, orden },
                });
            await actualizar(uno, otro.orden);
            await actualizar(otro, uno.orden);
        },
        onError: alFallar('No se pudo cambiar el orden'),
        onSettled: refrescar,
    });

    return {
        detalle,
        atributo,
        valores,
        formulario,
        errorGeneral,
        guardandoNombre: guardarNombre.isPending,
        guardarNombre: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            guardarNombre.mutate(datos);
        }),
        ocupado: agregarValor.isPending || editarValor.isPending || estadoValor.isPending || moverValor.isPending,
        agregarValor: agregarValor.mutateAsync,
        agregando: agregarValor.isPending,
        editarValor: editarValor.mutateAsync,
        alternarValor: estadoValor.mutate,
        moverValor: moverValor.mutate,
    };
}
