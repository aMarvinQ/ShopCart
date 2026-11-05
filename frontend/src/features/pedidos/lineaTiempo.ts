import type { PedidoCliente } from './hooks/usePedidos';

export interface PasoLinea {
    codigo: string;
    titulo: string;
    fecha: string | null;
    comentario: string | undefined;
    hecho: boolean;
}

const FLUJO_NORMAL = [
    { codigo: 'PAGADO', titulo: 'Pagado' },
    { codigo: 'EN_PREPARACION', titulo: 'En preparación' },
    { codigo: 'ENVIADO', titulo: 'Enviado' },
    { codigo: 'ENTREGADO', titulo: 'Entregado' },
];

/** Lo que ya ocurrió (de la API) y, mientras el pedido siga su curso, los pasos que faltan. */
export function pasosDeLinea({
    historial,
    codigoEstado,
}: Pick<PedidoCliente, 'historial' | 'codigoEstado'>): PasoLinea[] {
    const hechos: PasoLinea[] = historial.map((h) => ({
        codigo: h.codigoEstado,
        titulo: h.estado,
        fecha: h.fecha,
        comentario: h.comentario,
        hecho: true,
    }));
    if (!FLUJO_NORMAL.some((p) => p.codigo === codigoEstado)) return hechos;
    const pendientes = FLUJO_NORMAL.slice(FLUJO_NORMAL.findIndex((p) => p.codigo === codigoEstado) + 1).map((p) => ({
        ...p,
        fecha: null,
        comentario: undefined,
        hecho: false,
    }));
    return [...hechos, ...pendientes];
}
