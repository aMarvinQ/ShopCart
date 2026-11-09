import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, type DatosDe } from '../../../../api/cliente';
import { GRUPOS, presentacionDe, type Grupo } from '../presentacion';

export type Parametro = DatosDe<'get', '/parametros'>[number];

export const CLAVE_PARAMETROS = ['panel', 'parametros'];

const comparable = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function useParametros() {
    const [busqueda, setBusqueda] = useState('');
    const [grupo, setGrupo] = useState<Grupo | ''>('');

    const consulta = useQuery({
        queryKey: CLAVE_PARAMETROS,
        queryFn: ({ signal }) => api.get('/parametros', { signal }),
        staleTime: 30_000,
    });
    const todos = consulta.data?.data;

    /* Ordenados por grupo y luego como los entrega la API (por clave). */
    const visibles = useMemo(() => {
        const texto = comparable(busqueda.trim());
        return (todos ?? [])
            .map((parametro) => ({ parametro, ...presentacionDe(parametro.clave) }))
            .filter(
                (p) =>
                    (grupo === '' || p.grupo === grupo) &&
                    (texto === '' ||
                        comparable(`${p.titulo} ${p.parametro.descripcion} ${p.parametro.clave}`).includes(texto)),
            )
            .sort((a, b) => GRUPOS.indexOf(a.grupo) - GRUPOS.indexOf(b.grupo));
    }, [todos, busqueda, grupo]);

    /* Solo los grupos que tienen parámetros: "Otros" aparece si llega una clave sin presentación. */
    const grupos = useMemo(
        () => GRUPOS.filter((g) => (todos ?? []).some((p) => presentacionDe(p.clave).grupo === g)),
        [todos],
    );

    return {
        consulta,
        visibles,
        opcionesGrupo: [{ valor: '' as const, etiqueta: 'Todos' }, ...grupos.map((g) => ({ valor: g, etiqueta: g }))],
        busqueda,
        grupo,
        setBusqueda,
        setGrupo,
        limpiar: () => {
            setBusqueda('');
            setGrupo('');
        },
    };
}
