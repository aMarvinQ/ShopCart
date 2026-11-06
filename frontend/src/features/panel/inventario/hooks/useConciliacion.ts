import { useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { CLAVE_INVENTARIO } from '../../pedidos/hooks/useGestionPedido';

export type FilaConciliacion = DatosDe<'get', '/inventario/conciliacion'>[number];

/** Solo se consulta al abrir esta pestaña: recorre todo el kardex. */
export function useConciliacion() {
    return useQuery({
        queryKey: [...CLAVE_INVENTARIO, 'conciliacion'],
        queryFn: ({ signal }) => api.get('/inventario/conciliacion', { signal }),
    });
}
