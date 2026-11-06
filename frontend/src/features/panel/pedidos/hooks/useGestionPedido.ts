import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, type DatosDe } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';

export type PedidoPanel = DatosDe<'get', '/pedidos/{id}'>;
type EstadoDestino = 'EN_PREPARACION' | 'ENVIADO' | 'ENTREGADO';

const CLAVE_LISTAS = ['panel', 'pedidos'];
const claveDetalle = (id: number) => ['panel', 'pedido', id];

const AVANCES: Partial<Record<string, { estado: EstadoDestino; accion: string; hecho: string }>> = {
    PAGADO: { estado: 'EN_PREPARACION', accion: 'Pasar a preparación', hecho: 'En preparación' },
    EN_PREPARACION: { estado: 'ENVIADO', accion: 'Marcar como enviado', hecho: 'Enviado' },
    ENVIADO: { estado: 'ENTREGADO', accion: 'Marcar como entregado', hecho: 'Entregado' },
};

/** El siguiente paso operativo según el estado; quien decide si procede es la API. */
export const avanceDe = (codigoEstado: string) => AVANCES[codigoEstado];

/** El pedido abierto vive en la URL: se puede compartir, recargar y cerrar con el botón Atrás. */
export function usePedidoAbierto() {
    const [parametros, setParametros] = useSearchParams();
    const leido = Number(parametros.get('pedido'));
    const cambiar = useCallback(
        (id: number | null) => {
            setParametros(
                (actuales) => {
                    if (id === null) actuales.delete('pedido');
                    else actuales.set('pedido', String(id));
                    return actuales;
                    // La lista sigue debajo del cajón: abrirlo o cerrarlo no debe mover el scroll.
                },
                { preventScrollReset: true },
            );
        },
        [setParametros],
    );
    return {
        idAbierto: Number.isSafeInteger(leido) && leido > 0 ? leido : null,
        abrir: cambiar,
        cerrar: useCallback(() => {
            cambiar(null);
        }, [cambiar]),
    };
}

export function useDetallePedidoPanel(id: number | null) {
    return useQuery({
        queryKey: claveDetalle(id ?? 0),
        queryFn: ({ signal }) => api.get('/pedidos/{id}', { params: { id: id ?? 0 }, signal }),
        enabled: id !== null,
    });
}

/**
 * Tras cada acción, el detalle se actualiza con la respuesta y las listas se vuelven a pedir. Si la
 * API la rechaza (por ejemplo, otra persona ya lo cambió), se avisa y se recarga lo que se ve.
 */
function useTrasAccion() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const refrescarListas = () => consultas.invalidateQueries({ queryKey: CLAVE_LISTAS });
    return {
        alCompletar: async (respuesta: { data: PedidoPanel }, titulo: string) => {
            consultas.setQueryData(claveDetalle(respuesta.data.idPedido), respuesta);
            avisar({ tipo: 'exito', titulo, detalle: `Pedido ${respuesta.data.numeroPedido}` });
            await refrescarListas();
        },
        alFallar: async (id: number, titulo: string, error: Error) => {
            avisar({ tipo: 'error', titulo, detalle: error.message });
            await Promise.all([refrescarListas(), consultas.invalidateQueries({ queryKey: claveDetalle(id) })]);
        },
    };
}

export function useAvanzarEstado() {
    const { alCompletar, alFallar } = useTrasAccion();
    const avanzar = useMutation({
        mutationFn: ({
            id,
            estado,
            comentario,
        }: {
            id: number;
            estado: EstadoDestino;
            hecho: string;
            comentario?: string;
        }) =>
            api.patch('/pedidos/{id}/estado', {
                params: { id },
                cuerpo: { estado, ...(comentario && { comentario }) },
            }),
        onSuccess: (respuesta, { hecho }) => alCompletar(respuesta, `Pedido: ${hecho}`),
        onError: (error, { id }) => alFallar(id, 'No se pudo avanzar el pedido', error),
    });
    return {
        avanzando: avanzar.isPending,
        idAvanzando: avanzar.isPending ? avanzar.variables.id : null,
        avanzar: (id: number, codigoEstado: string, comentario = '', alTerminar?: () => void) => {
            const avance = avanceDe(codigoEstado);
            if (!avance) return;
            avanzar.mutate(
                { id, estado: avance.estado, hecho: avance.hecho, comentario: comentario.trim() },
                { ...(alTerminar && { onSuccess: alTerminar }) },
            );
        },
    };
}

export function useCancelarPedidoPanel(id: number) {
    const { alCompletar, alFallar } = useTrasAccion();
    const [confirmando, setConfirmando] = useState(false);
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState<string | undefined>();
    const cancelar = useMutation({
        mutationFn: (texto: string) =>
            api.post('/pedidos/{id}/cancelar', { params: { id }, cuerpo: { motivo: texto } }),
        onSuccess: (respuesta) => alCompletar(respuesta, 'Pedido cancelado'),
        onError: (e) => alFallar(id, 'No se pudo cancelar', e),
        onSettled: () => {
            setConfirmando(false);
            setMotivo('');
        },
    });
    return {
        confirmando,
        motivo,
        error,
        cancelando: cancelar.isPending,
        escribirMotivo: (texto: string) => {
            setMotivo(texto);
            setError(undefined);
        },
        pedirConfirmacion: () => {
            setConfirmando(true);
        },
        desistir: () => {
            setConfirmando(false);
            setError(undefined);
        },
        confirmar: () => {
            const texto = motivo.trim();
            if (!texto) {
                setError('Escribe el motivo de la cancelación.');
                return;
            }
            cancelar.mutate(texto);
        },
    };
}
