import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../../api/cliente';
import { useAvisos } from '../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../utils/formularios';
import {
    CAMPOS_DIRECCION_API,
    cuerpoDireccion,
    esquemaAlias,
    esquemaCamposDireccion,
    valoresDireccion,
    type Direccion,
} from '../datosDireccion';

const CLAVE = ['direcciones'];

const esquema = esquemaCamposDireccion.extend({ alias: esquemaAlias, esPredeterminada: z.boolean() });
type Datos = z.infer<typeof esquema>;

/** Libreta del cliente. Cada cambio responde con la libreta completa: esa es la que se muestra. */
export function useDirecciones() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [cajon, setCajon] = useState<{ direccion: Direccion | null } | null>(null);
    const [porEliminar, setPorEliminar] = useState<Direccion | null>(null);
    const consulta = useQuery({
        queryKey: CLAVE,
        queryFn: ({ signal }) => api.get('/direcciones', { signal }),
    });
    const alFallar = (error: Error) => {
        avisar({ tipo: 'error', titulo: 'No se pudo completar', detalle: error.message });
    };
    const predeterminar = useMutation({
        mutationFn: (id: number) => api.post('/direcciones/{id}/predeterminada', { params: { id } }),
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
        },
        onError: alFallar,
    });
    const eliminar = useMutation({
        mutationFn: (id: number) => api.delete('/direcciones/{id}', { params: { id } }),
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
            setPorEliminar(null);
        },
        onError: (error) => {
            setPorEliminar(null);
            alFallar(error);
        },
    });
    return {
        consulta,
        cajon,
        abrirCajon: (direccion: Direccion | null) => {
            setCajon({ direccion });
        },
        cerrarCajon: () => {
            setCajon(null);
        },
        porEliminar,
        pedirEliminar: setPorEliminar,
        cancelarEliminar: () => {
            setPorEliminar(null);
        },
        confirmarEliminar: () => {
            if (porEliminar) eliminar.mutate(porEliminar.idDireccion);
        },
        eliminando: eliminar.isPending,
        predeterminar: predeterminar.mutate,
        predeterminando: predeterminar.isPending ? predeterminar.variables : undefined,
    };
}

export function useFormularioDireccion(direccion: Direccion | null, alGuardar: (idNueva?: number) => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        defaultValues: { ...valoresDireccion(direccion), alias: direccion?.alias ?? '', esPredeterminada: false },
    });

    const guardar = useMutation({
        mutationFn: async (datos: Datos) => {
            const cuerpo = { ...cuerpoDireccion(datos), alias: datos.alias };
            if (direccion) {
                const { data } = await api.put('/direcciones/{id}', { params: { id: direccion.idDireccion }, cuerpo });
                return { lista: data };
            }
            const { data } = await api.post('/direcciones', {
                cuerpo: { ...cuerpo, esPredeterminada: datos.esPredeterminada },
            });
            return { lista: data.direcciones, idNueva: data.idDireccion };
        },
        onSuccess: ({ lista, idNueva }) => {
            consultas.setQueryData(CLAVE, { data: lista });
            avisar({ tipo: 'exito', titulo: direccion ? 'Dirección actualizada' : 'Dirección agregada' });
            alGuardar(idNueva);
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    [...CAMPOS_DIRECCION_API, 'alias'],
                    'No pudimos guardar la dirección; intenta de nuevo.',
                ),
            );
        },
    });

    return {
        formulario,
        errorGeneral,
        guardando: guardar.isPending,
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            guardar.mutate(datos);
        }),
    };
}
