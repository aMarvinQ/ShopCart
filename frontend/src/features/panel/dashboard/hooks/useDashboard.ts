import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { api, type DatosDe } from '../../../../api/cliente';
import { useVistaUrl } from '../../../../ui/useVistaUrl';
import { hoyGuatemala, inicioDeMes, sumarDias } from '../../../../utils/calendario';
import type { EventoSse } from '../flujoSse';
import { useTiempoReal } from './useTiempoReal';

export type Resumen = DatosDe<'get', '/reportes/resumen'>;
export type PedidoReciente = DatosDe<'get', '/pedidos'>[number];
export type VentaPeriodo = DatosDe<'get', '/reportes/ventas'>[number];

/** Lo que la API envía en el evento "resumen" del flujo en tiempo real. */
interface EstadoEnVivo {
    hoy: string;
    resumen: Resumen;
    ultimosPedidos: PedidoReciente[];
    generadoEn: string;
}

const BASE = ['panel', 'dashboard'];
/* Lo de hoy lo alimenta el flujo; lo demás se vuelve a pedir cuando el flujo avisa cambios. */
const CLAVE_HOY = [...BASE, 'hoy'];
const CLAVE_RECIENTES = [...BASE, 'recientes'];
const CLAVE_PERIODO = [...BASE, 'periodo'];
const CLAVE_OPERACION = [...BASE, 'operacion'];

export const PERIODOS = [
    { valor: '14', etiqueta: 'Últimos 14 días' },
    { valor: '7', etiqueta: 'Últimos 7 días' },
    { valor: '30', etiqueta: 'Últimos 30 días' },
    { valor: 'mes', etiqueta: 'Este mes' },
] as const;
type Periodo = (typeof PERIODOS)[number]['valor'];

const CATEGORIAS_VISIBLES = 6;

/** Días de Guatemala, ambos incluidos, como los recibe la API. */
function rangoDe(periodo: Periodo, hoy: string) {
    const fechaDesde = periodo === 'mes' ? inicioDeMes(hoy) : sumarDias(hoy, 1 - Number(periodo));
    return { fechaDesde, fechaHasta: hoy };
}

export function useDashboard() {
    const consultas = useQueryClient();
    const { vista: periodo, elegir: elegirPeriodo } = useVistaUrl(PERIODOS);
    const [hoy, setHoy] = useState(hoyGuatemala);
    const [actualizadoEn, setActualizadoEn] = useState<string | null>(null);
    const rango = rangoDe(periodo, hoy);

    /* --- En vivo: indicadores de hoy y últimos pedidos --- */
    const resumenHoy = useQuery({
        queryKey: [...CLAVE_HOY, hoy],
        queryFn: ({ signal }) => api.get('/reportes/resumen', { query: { fechaDesde: hoy, fechaHasta: hoy }, signal }),
        select: ({ data }) => data,
    });
    const recientes = useQuery({
        queryKey: CLAVE_RECIENTES,
        queryFn: ({ signal }) =>
            api.get('/pedidos', {
                query: { pagina: 1, tamanoPagina: 5, ordenarPor: 'FECHA', direccion: 'DESC' },
                signal,
            }),
        select: ({ data }) => data,
    });

    const alEvento = useCallback(
        ({ evento, datos }: EventoSse) => {
            if (evento !== 'resumen') return;
            const estado = JSON.parse(datos) as EstadoEnVivo;
            setHoy(estado.hoy); // a medianoche el dashboard pasa al día nuevo
            setActualizadoEn(estado.generadoEn);
            consultas.setQueryData([...CLAVE_HOY, estado.hoy], { data: estado.resumen });
            consultas.setQueryData(CLAVE_RECIENTES, { data: estado.ultimosPedidos });
            // Cambiaron los números: el periodo y la operación se piden de nuevo (si están a la vista).
            void consultas.invalidateQueries({ queryKey: CLAVE_PERIODO });
            void consultas.invalidateQueries({ queryKey: CLAVE_OPERACION });
        },
        [consultas],
    );
    const enVivo = useTiempoReal(alEvento);

    /* --- Operación: lo que espera atención --- */
    const contarPedidos = (estado: 'PAGADO' | 'EN_PREPARACION') => ({
        queryKey: [...CLAVE_OPERACION, 'pedidos', estado],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
            api.get('/pedidos', { query: { pagina: 1, tamanoPagina: 1, estado }, signal }),
        select: ({ meta }: { meta: { totalRegistros: number } }) => meta.totalRegistros,
    });
    const pagados = useQuery(contarPedidos('PAGADO'));
    const enPreparacion = useQuery(contarPedidos('EN_PREPARACION'));
    const existenciaBaja = useQuery({
        queryKey: [...CLAVE_OPERACION, 'existencia-baja'],
        queryFn: ({ signal }) =>
            api.get('/inventario/existencias', {
                query: {
                    pagina: 1,
                    tamanoPagina: 5,
                    soloExistenciaBaja: 'true',
                    ordenarPor: 'DISPONIBLE',
                    direccion: 'ASC',
                },
                signal,
            }),
    });

    /* --- Periodo elegido --- */
    const resumenPeriodo = useQuery({
        queryKey: [...CLAVE_PERIODO, 'resumen', rango],
        queryFn: ({ signal }) => api.get('/reportes/resumen', { query: rango, signal }),
        select: ({ data }) => data,
    });
    const ventas = useQuery({
        queryKey: [...CLAVE_PERIODO, 'ventas', rango],
        queryFn: ({ signal }) => api.get('/reportes/ventas', { query: { ...rango, agrupacion: 'DIA' }, signal }),
        select: ({ data }) => data,
    });
    const categorias = useQuery({
        queryKey: [...CLAVE_PERIODO, 'categorias', rango],
        queryFn: ({ signal }) => api.get('/reportes/ventas-por-categoria', { query: rango, signal }),
        // Las de mayor venta (la API las entrega ordenadas); el resto se menciona sin listarlo.
        select: ({ data }) => ({
            filas: data.slice(0, CATEGORIAS_VISIBLES),
            restantes: Math.max(0, data.length - CATEGORIAS_VISIBLES),
        }),
    });
    const topProductos = useQuery({
        queryKey: [...CLAVE_PERIODO, 'top', rango],
        queryFn: ({ signal }) => api.get('/reportes/top-productos', { query: rango, signal }),
        select: ({ data }) => data,
    });
    const carritos = useQuery({
        queryKey: [...CLAVE_PERIODO, 'carritos'],
        queryFn: ({ signal }) =>
            api.get('/reportes/carritos-abandonados', {
                query: { pagina: 1, tamanoPagina: 5, ordenarPor: 'VALOR', direccion: 'DESC' },
                signal,
            }),
    });

    return {
        hoy,
        actualizadoEn,
        enVivo,
        periodo,
        elegirPeriodo,
        rango,
        resumenHoy,
        recientes,
        porDespachar:
            pagados.data !== undefined && enPreparacion.data !== undefined
                ? { pagados: pagados.data, enPreparacion: enPreparacion.data }
                : undefined,
        existenciaBaja,
        resumenPeriodo,
        ventas,
        categorias,
        topProductos,
        carritos,
    };
}
