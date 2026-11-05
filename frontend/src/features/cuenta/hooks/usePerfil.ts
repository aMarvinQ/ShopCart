import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../../api/cliente';
import { useSesion } from '../../../sesion/contexto';
import { useAvisos } from '../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../utils/formularios';
import { esquemaApellido, esquemaContrasenaNueva, esquemaNombre, esquemaTelefono } from '../esquemas';

export type DatosPerfil = DatosDe<'get', '/perfil'>;

const CLAVE = ['perfil'];

const esquemaDatos = z.object({ nombre: esquemaNombre, apellido: esquemaApellido, telefono: esquemaTelefono });
type Datos = z.infer<typeof esquemaDatos>;

const esquemaClave = z.object({
    contrasenaActual: z.string().min(1, 'Escribe tu contraseña actual.'),
    contrasenaNueva: esquemaContrasenaNueva,
});
type Clave = z.infer<typeof esquemaClave>;

export function usePerfil() {
    return useQuery({
        queryKey: CLAVE,
        queryFn: ({ signal }) => api.get('/perfil', { signal }),
    });
}

export function useFormularioPerfil(perfil: DatosPerfil) {
    const { actualizarNombre } = useSesion();
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquemaDatos),
        defaultValues: { nombre: perfil.nombre, apellido: perfil.apellido, telefono: perfil.telefono ?? '' },
    });
    const guardar = useMutation({
        mutationFn: ({ nombre, apellido, telefono }: Datos) =>
            api.put('/perfil', { cuerpo: { nombre, apellido, telefono: telefono || null } }),
        onSuccess: ({ data }) => {
            setErrorGeneral(null);
            consultas.setQueryData(CLAVE, { data });
            actualizarNombre(data.nombre, data.apellido);
            avisar({ tipo: 'exito', titulo: 'Perfil actualizado' });
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    ['nombre', 'apellido', 'telefono'],
                    'No pudimos guardar los cambios; intenta de nuevo.',
                ),
            );
        },
    });
    return {
        formulario,
        errorGeneral,
        guardando: guardar.isPending,
        enviar: formulario.handleSubmit((datos) => {
            guardar.mutate(datos);
        }),
    };
}

export function useFormularioContrasena() {
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<Clave>({ resolver: zodResolver(esquemaClave) });
    const cambiar = useMutation({
        mutationFn: (datos: Clave) => api.post('/auth/cambiar-contrasena', { cuerpo: datos }),
        onSuccess: ({ data }) => {
            setErrorGeneral(null);
            formulario.reset();
            avisar({
                tipo: 'exito',
                titulo: 'Contraseña actualizada',
                ...(data.sesionesCerradas > 0 && { detalle: 'Cerramos tu sesión en los demás dispositivos.' }),
            });
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    ['contrasenaActual', 'contrasenaNueva'],
                    'No pudimos cambiar la contraseña; intenta de nuevo.',
                ),
            );
        },
    });
    return {
        formulario,
        errorGeneral,
        cambiando: cambiar.isPending,
        enviar: formulario.handleSubmit((datos) => {
            cambiar.mutate(datos);
        }),
    };
}
