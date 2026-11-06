import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';
import { textoRango } from '../../../../utils/calendario';
import { leerDia, rangoParaApi } from '../../../../utils/formato';
import { CLAVE_INVENTARIO } from '../../pedidos/hooks/useGestionPedido';

export type FilaKardex = DatosDe<'get', '/inventario/kardex'>[number];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['FECHA', 'PRODUCTO', 'CANTIDAD'];
const ORDEN_INICIAL = { ordenarPor: 'FECHA', direccion: 'DESC' } as const;
const FILTROS = ['tipo', 'desde', 'hasta', 'variante'] as const;

const TIPOS = [
    { valor: 'ENTRADA_COMPRA', etiqueta: 'Entrada por compra' },
    { valor: 'AJUSTE_ENTRADA', etiqueta: 'Ajuste de entrada' },
    { valor: 'AJUSTE_SALIDA', etiqueta: 'Ajuste de salida' },
    { valor: 'INVENTARIO_INICIAL', etiqueta: 'Inventario inicial' },
    { valor: 'SALIDA_VENTA', etiqueta: 'Venta' },
    { valor: 'CANCELACION', etiqueta: 'Cancelación' },
    { valor: 'DEVOLUCION', etiqueta: 'Devolución' },
] as const;

export const OPCIONES_TIPO = [{ valor: '', etiqueta: 'Todos los tipos' }, ...TIPOS];

export const ORDENES_MOVIL = [
    { etiqueta: 'Más recientes', ordenarPor: 'FECHA', direccion: 'DESC' },
    { etiqueta: 'Más antiguos', ordenarPor: 'FECHA', direccion: 'ASC' },
    { etiqueta: 'Mayor cantidad', ordenarPor: 'CANTIDAD', direccion: 'DESC' },
    { etiqueta: 'Producto: A a Z', ordenarPor: 'PRODUCTO', direccion: 'ASC' },
] as const;

export function useKardex() {
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, filtrarVarios, limpiarFiltros } =
        useParametrosTabla({ columnas: COLUMNAS, ordenPorDefecto: ORDEN_INICIAL, filtros: FILTROS });
    const tipo = TIPOS.find((t) => t.valor === filtros.tipo)?.valor;
    const desde = leerDia(filtros.desde);
    const hasta = leerDia(filtros.hasta);
    const leida = Number(filtros.variante);
    const idVariante = Number.isSafeInteger(leida) && leida > 0 ? leida : null;

    const consulta = useQuery({
        queryKey: [...CLAVE_INVENTARIO, 'kardex', { pagina, orden, tipo, desde, hasta, idVariante }],
        queryFn: ({ signal }) =>
            api.get('/inventario/kardex', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...(tipo && { tipo }),
                    ...(idVariante !== null && { idVariante }),
                    ...rangoParaApi(filtros.desde, filtros.hasta),
                },
                signal,
            }),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });

    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        tipo: tipo ?? '',
        desde,
        hasta,
        rango: textoRango(desde, hasta),
        filtraVariante: idVariante !== null,
        skuFiltrado: idVariante !== null ? consulta.data?.data[0]?.sku : undefined,
        hayFiltros: tipo !== undefined || desde !== null || hasta !== null || idVariante !== null,
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
        elegirFechas: (primero: string, ultimo: string) => {
            filtrarVarios({ desde: primero, hasta: ultimo });
        },
        quitarFechas: () => {
            filtrarVarios({ desde: '', hasta: '' });
        },
    };
}
