import { useQuery } from '@tanstack/react-query';
import { useController, useFormContext } from 'react-hook-form';
import { api } from '../../../api/cliente';
import type { DatosCamposDireccion } from '../datosDireccion';

const SIN_VENCER = Infinity;

/** Departamento y municipio del formulario actual: elegir otro departamento borra el municipio. */
export function useCamposUbicacion() {
    const { control, setValue } = useFormContext<DatosCamposDireccion>();
    const departamento = useController({ control, name: 'idDepartamento' });
    const municipio = useController({ control, name: 'idMunicipio' });
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

    return {
        departamento: {
            valor: idDepartamento,
            opciones: (departamentos.data?.data ?? []).map((d) => ({
                valor: String(d.idDepartamento),
                etiqueta: d.nombre,
            })),
            onBlur: departamento.field.onBlur,
            alCambiar: (valor: string) => {
                departamento.field.onChange(valor);
                setValue('idMunicipio', '');
            },
        },
        municipio: {
            valor: municipio.field.value,
            opciones: (municipios.data?.data ?? []).map((m) => ({ valor: String(m.idMunicipio), etiqueta: m.nombre })),
            onBlur: municipio.field.onBlur,
            alCambiar: municipio.field.onChange,
        },
    };
}
