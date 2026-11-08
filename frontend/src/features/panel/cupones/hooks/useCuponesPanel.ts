import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DatosDe } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';
import { moneda, rangoDias, diaDe, ultimoDiaDe } from '../../../../utils/formato';

export type FilaCupon = DatosDe<'get', '/cupones'>[number];

export const CLAVE_CUPONES = ['panel', 'cupones'];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['RECIENTES', 'CODIGO', 'VIGENCIA', 'USOS'];
const ORDEN_INICIAL = { ordenarPor: 'RECIENTES', direccion: 'DESC' } as const;
const FILTROS = ['busqueda', 'situacion'] as const;
const SITUACIONES = ['VIGENTE', 'PROGRAMADO', 'VENCIDO', 'AGOTADO', 'INACTIVO'] as const;
type Situacion = (typeof SITUACIONES)[number];

export const OPCIONES_SITUACION = [
    { valor: '', etiqueta: 'Todos los estados' },
    { valor: 'VIGENTE', etiqueta: 'Vigentes' },
    { valor: 'PROGRAMADO', etiqueta: 'Programados' },
    { valor: 'VENCIDO', etiqueta: 'Vencidos' },
    { valor: 'AGOTADO', etiqueta: 'Agotados' },
    { valor: 'INACTIVO', etiqueta: 'Desactivados' },
];

export const ORDENES_MOVIL = [
    { etiqueta: 'Más recientes', ordenarPor: 'RECIENTES', direccion: 'DESC' },
    { etiqueta: 'Código: A a Z', ordenarPor: 'CODIGO', direccion: 'ASC' },
    { etiqueta: 'Vencen primero', ordenarPor: 'VIGENCIA', direccion: 'ASC' },
    { etiqueta: 'Más usados', ordenarPor: 'USOS', direccion: 'DESC' },
] as const;

export const textoDescuento = ({ tipoDescuento, valor }: FilaCupon) =>
    tipoDescuento === 'PORCENTAJE' ? `${String(valor)} %` : moneda(valor);

export const textoVigencia = ({ fechaInicio, fechaFin }: FilaCupon) =>
    rangoDias(diaDe(fechaInicio), ultimoDiaDe(fechaFin));

/** Las condiciones que no caben en "Aplica a": monto mínimo y solo registrados. */
export const textoCondiciones = ({ montoMinimo, soloRegistrados }: FilaCupon) =>
    [montoMinimo > 0 ? `Compras desde ${moneda(montoMinimo)}` : '', soloRegistrados ? 'Solo registrados' : '']
        .filter(Boolean)
        .join(' · ');

/** Porcentaje de usos para la barra; sin límite no hay proporción que mostrar. */
export const proporcionUsos = ({ usosActuales, limiteUsosTotal }: FilaCupon) =>
    limiteUsosTotal === null ? 0 : Math.min(100, (usosActuales / limiteUsosTotal) * 100);

export function useCuponesPanel() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [porDesactivar, setPorDesactivar] = useState<FilaCupon | null>(null);
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, limpiarFiltros } = useParametrosTabla({
        columnas: COLUMNAS,
        ordenPorDefecto: ORDEN_INICIAL,
        filtros: FILTROS,
    });
    const busqueda = filtros.busqueda.trim().slice(0, 100);
    const situacion = SITUACIONES.find((s): s is Situacion => s === filtros.situacion);

    const consulta = useQuery({
        queryKey: [...CLAVE_CUPONES, { pagina, orden, busqueda, situacion }],
        queryFn: ({ signal }) =>
            api.get('/cupones', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...(busqueda && { busqueda }),
                    ...(situacion && { situacion }),
                },
                signal,
            }),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
            api.patch('/cupones/{id}/estado', { params: { id }, cuerpo: { activo } }),
        onSuccess: ({ data }) => {
            avisar({
                tipo: 'exito',
                titulo: data.activo ? 'Cupón activado' : 'Cupón desactivado',
                detalle: data.codigo,
            });
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo cambiar el estado', detalle: error.message });
        },
        onSettled: async () => {
            setPorDesactivar(null);
            await consultas.invalidateQueries({ queryKey: CLAVE_CUPONES });
        },
    });

    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        busqueda,
        situacion: situacion ?? '',
        hayFiltros: busqueda !== '' || situacion !== undefined,
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
        porDesactivar,
        cambiando: cambiarEstado.isPending,
        alternar: cambiarEstado.mutate,
        pedirDesactivar: setPorDesactivar,
        desistir: () => {
            setPorDesactivar(null);
        },
        confirmarDesactivar: () => {
            if (porDesactivar) cambiarEstado.mutate({ id: porDesactivar.idCupon, activo: false });
        },
    };
}
