import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../../api/cliente';
import { useAvisos } from '../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../utils/formularios';

export type Direccion = DatosDe<'get', '/direcciones'>[number];

const CLAVE = ['direcciones'];
const texto = (mensaje: string, maximo: number) =>
    z
        .string()
        .trim()
        .min(1, mensaje)
        .max(maximo, `Máximo ${String(maximo)} caracteres.`);

const esquema = z.object({
    alias: texto('Ponle un nombre, como Casa.', 50),
    nombreDestinatario: texto('Escribe quién recibe.', 150),
    telefono: z
        .string()
        .trim()
        .min(8, 'Debe tener al menos 8 dígitos.')
        .max(20, 'Máximo 20 caracteres.')
        .regex(/^[0-9+\- ]+$/, 'Usa solo dígitos, espacios, + y -.'),
    linea1: texto('Escribe la dirección.', 200),
    linea2: z.string().trim().max(200, 'Máximo 200 caracteres.'),
    idDepartamento: z.string().min(1, 'Elige el departamento.'),
    idMunicipio: z.string().min(1, 'Elige el municipio.'),
    codigoPostal: z
        .string()
        .trim()
        .regex(/^(\d{5})?$/, 'Deben ser 5 dígitos.'),
    referencias: z.string().trim().max(300, 'Máximo 300 caracteres.'),
    esPredeterminada: z.boolean(),
});
type Datos = z.infer<typeof esquema>;

const CAMPOS_API = [
    'alias',
    'nombreDestinatario',
    'telefono',
    'linea1',
    'linea2',
    'idMunicipio',
    'codigoPostal',
    'referencias',
] as const;

const SIN_VENCER = Infinity;

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

export function useFormularioDireccion(direccion: Direccion | null, alTerminar: () => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        defaultValues: {
            alias: direccion?.alias ?? '',
            nombreDestinatario: direccion?.nombreDestinatario ?? '',
            telefono: direccion?.telefono ?? '',
            linea1: direccion?.linea1 ?? '',
            linea2: direccion?.linea2 ?? '',
            idDepartamento: direccion ? String(direccion.idDepartamento) : '',
            idMunicipio: direccion ? String(direccion.idMunicipio) : '',
            codigoPostal: direccion?.codigoPostal ?? '',
            referencias: direccion?.referencias ?? '',
            esPredeterminada: false,
        },
    });
    const departamento = useController({ control: formulario.control, name: 'idDepartamento' });
    const municipio = useController({ control: formulario.control, name: 'idMunicipio' });
    const idDepartamento = departamento.field.value;

    const departamentos = useQuery({
        queryKey: ['departamentos'],
        queryFn: ({ signal }) => api.get('/departamentos', { signal }),
        staleTime: SIN_VENCER,
    });
    const municipios = useQuery({
        queryKey: ['municipios', idDepartamento],
        queryFn: ({ signal }) =>
            api.get('/departamentos/{id}/municipios', { params: { id: Number(idDepartamento) }, signal }),
        enabled: idDepartamento !== '',
        staleTime: SIN_VENCER,
    });

    const guardar = useMutation({
        mutationFn: async (datos: Datos) => {
            const cuerpo = {
                alias: datos.alias,
                nombreDestinatario: datos.nombreDestinatario,
                telefono: datos.telefono,
                linea1: datos.linea1,
                linea2: datos.linea2 || null,
                idMunicipio: Number(datos.idMunicipio),
                codigoPostal: datos.codigoPostal || null,
                referencias: datos.referencias || null,
            };
            if (direccion) return api.put('/direcciones/{id}', { params: { id: direccion.idDireccion }, cuerpo });
            const { data } = await api.post('/direcciones', {
                cuerpo: { ...cuerpo, esPredeterminada: datos.esPredeterminada },
            });
            return { data: data.direcciones };
        },
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
            avisar({ tipo: 'exito', titulo: direccion ? 'Dirección actualizada' : 'Dirección agregada' });
            alTerminar();
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    CAMPOS_API,
                    'No pudimos guardar la dirección; intenta de nuevo.',
                ),
            );
        },
    });

    return {
        formulario,
        errorGeneral,
        guardando: guardar.isPending,
        departamento: {
            valor: idDepartamento,
            opciones: (departamentos.data?.data ?? []).map((d) => ({
                valor: String(d.idDepartamento),
                etiqueta: d.nombre,
            })),
            onBlur: departamento.field.onBlur,
            alCambiar: (valor: string) => {
                departamento.field.onChange(valor);
                formulario.setValue('idMunicipio', '');
            },
        },
        municipio: {
            valor: municipio.field.value,
            opciones: (municipios.data?.data ?? []).map((m) => ({ valor: String(m.idMunicipio), etiqueta: m.nombre })),
            onBlur: municipio.field.onBlur,
            alCambiar: municipio.field.onChange,
        },
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            guardar.mutate(datos);
        }),
    };
}
