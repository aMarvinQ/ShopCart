import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DatosDe } from '../../../../../api/cliente';
import type { Producto } from './useEdicionProducto';

export type CambioPrecio = DatosDe<'get', '/variantes/{id}/precios'>[number];

export function useHistorialPrecios(producto: Producto) {
    const [elegida, setElegida] = useState<number | null>(null);
    const idVariante = elegida ?? producto.variantes[0]?.idVariante ?? null;
    const consulta = useQuery({
        queryKey: ['panel', 'catalogo', 'productos', 'precios', idVariante],
        queryFn: ({ signal }) => api.get('/variantes/{id}/precios', { params: { id: idVariante ?? 0 }, signal }),
        enabled: idVariante !== null,
        staleTime: 0,
    });
    return { idVariante, elegir: setElegida, consulta };
}
