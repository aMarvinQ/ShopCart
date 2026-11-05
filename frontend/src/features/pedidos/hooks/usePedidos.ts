import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { api, type DatosDe } from '../../../api/cliente';
import { useAvisos } from '../../../ui/avisos/contexto';

export type PedidoCliente = DatosDe<'get', '/mis-pedidos/{id}'>;

const TAMANO_PAGINA = 10;
const CLAVE_LISTA = ['mis-pedidos'];

/** Lista con la página en la URL: se puede compartir y sobrevive a recargar y al botón Atrás. */
export function useMisPedidos() {
    const [parametros, setParametros] = useSearchParams();
    const leida = Number(parametros.get('pagina'));
    const pagina = Number.isSafeInteger(leida) && leida >= 1 ? leida : 1;
    const consulta = useQuery({
        queryKey: [...CLAVE_LISTA, pagina],
        queryFn: ({ signal }) =>
            api.get('/mis-pedidos', {
                query: { pagina, tamanoPagina: TAMANO_PAGINA, ordenarPor: 'FECHA', direccion: 'DESC' },
                signal,
            }),
    });
    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        irAPagina: (nueva: number) => {
            setParametros({ pagina: String(nueva) });
        },
    };
}

export function useMiPedido(id: number | null) {
    return useQuery({
        queryKey: ['mi-pedido', id],
        queryFn: ({ signal }) => api.get('/mis-pedidos/{id}', { params: { id: id ?? 0 }, signal }),
        enabled: id !== null,
    });
}

export function useCancelarPedido(id: number) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [confirmando, setConfirmando] = useState(false);
    const cancelar = useMutation({
        mutationFn: () => api.post('/mis-pedidos/{id}/cancelar', { params: { id }, cuerpo: {} }),
        onSuccess: async (respuesta) => {
            consultas.setQueryData(['mi-pedido', id], respuesta);
            setConfirmando(false);
            avisar({ tipo: 'exito', titulo: 'Pedido cancelado', detalle: 'Reembolsamos el pago a tu tarjeta.' });
            await consultas.invalidateQueries({ queryKey: CLAVE_LISTA });
        },
        onError: (error) => {
            setConfirmando(false);
            avisar({ tipo: 'error', titulo: 'No se pudo cancelar', detalle: error.message });
        },
    });
    return {
        confirmando,
        cancelando: cancelar.isPending,
        pedirConfirmacion: () => {
            setConfirmando(true);
        },
        desistir: () => {
            setConfirmando(false);
        },
        confirmar: () => {
            cancelar.mutate();
        },
    };
}

export function useSeguimiento(token: string) {
    return useQuery({
        queryKey: ['seguimiento', token],
        queryFn: ({ signal }) => api.get('/seguimiento/{token}', { params: { token }, signal }),
    });
}
