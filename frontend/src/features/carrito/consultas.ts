import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, type DatosDe } from '../../api/cliente';
import { useSesion } from '../../sesion/contexto';
import { useAvisos } from '../../ui/avisos/contexto';

export type Carrito = DatosDe<'get', '/carrito'>;
export type LineaCarrito = Carrito['items'][number];

const CLAVE = ['carrito'];
/* Los cambios del carrito salen en fila: una respuesta vieja no puede pisar a una más nueva. */
const EN_FILA = { id: 'carrito' };

/** Carrito del cliente o del invitado. El personal no compra: no se consulta. */
export function useCarrito() {
    const { usuario } = useSesion();
    return useQuery({
        queryKey: CLAVE,
        queryFn: ({ signal }) => api.get('/carrito', { signal }),
        enabled: !usuario || usuario.codigoRol === 'CLIENTE',
        staleTime: 30_000,
    });
}

/** Cada cambio responde con el carrito completo: esa respuesta es la que se muestra, sin recalcular nada. */
export function useCambioCarrito<V>(cambiar: (variables: V) => Promise<{ data: Carrito }>) {
    const consultas = useQueryClient();
    return useMutation({
        mutationFn: cambiar,
        scope: EN_FILA,
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
        },
    });
}

export function useAgregarAlCarrito() {
    const avisar = useAvisos();
    const navegar = useNavigate();
    const cambio = useCambioCarrito(
        ({ idVariante, cantidad }: { idVariante: number; cantidad: number; nombre: string }) =>
            api.post('/carrito/items', { cuerpo: { idVariante, cantidad } }),
    );
    return {
        agregando: cambio.isPending,
        agregar: (variables: { idVariante: number; cantidad: number; nombre: string }) =>
            cambio.mutateAsync(variables).then(
                () => {
                    avisar({
                        tipo: 'exito',
                        titulo: 'Agregado al carrito',
                        detalle: `${variables.nombre} · ${String(variables.cantidad)} u`,
                        accion: {
                            etiqueta: 'Ver carrito',
                            alElegir: () => void navegar('/carrito'),
                        },
                    });
                },
                (error: unknown) => {
                    avisar({
                        tipo: 'error',
                        titulo: 'No se pudo agregar',
                        detalle: error instanceof Error ? error.message : 'Intenta de nuevo.',
                    });
                },
            ),
    };
}
