import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, type DatosDe } from '../../../api/cliente';
import { useSesion } from '../../../sesion/contexto';
import { useAvisos } from '../../../ui/avisos/contexto';

export type Carrito = DatosDe<'get', '/carrito'>;
export type LineaCarrito = Carrito['items'][number];

const CLAVE = ['carrito'];
/* Los cambios del carrito salen en fila: una respuesta vieja no puede pisar a una más nueva. */
const EN_FILA = { id: 'carrito' };
const LARGO_MINIMO_CUPON = 3;

/** Carrito del cliente o del invitado. El personal no compra: no se consulta. */
export function useCarrito() {
    const { usuario } = useSesion();
    const esPersonal = usuario !== null && usuario.codigoRol !== 'CLIENTE';
    const consulta = useQuery({
        queryKey: CLAVE,
        queryFn: ({ signal }) => api.get('/carrito', { signal }),
        enabled: !esPersonal,
        staleTime: 30_000,
    });
    return { ...consulta, esPersonal, esInvitado: usuario === null };
}

/** Cada cambio responde con el carrito completo: esa respuesta es la que se muestra, sin recalcular nada. */
function useCambioCarrito<V>(cambiar: (variables: V) => Promise<{ data: Carrito }>) {
    const consultas = useQueryClient();
    return useMutation({
        mutationFn: cambiar,
        scope: EN_FILA,
        onSuccess: (respuesta) => {
            consultas.setQueryData(CLAVE, respuesta);
        },
    });
}

const mensajeDe = (error: unknown) => (error instanceof Error ? error.message : 'Intenta de nuevo.');

export function useAgregarAlCarrito() {
    const avisar = useAvisos();
    const navegar = useNavigate();
    const cambio = useCambioCarrito(
        ({ idVariante, cantidad }: { idVariante: number; cantidad: number; nombre: string }) =>
            api.post('/carrito/items', { cuerpo: { idVariante, cantidad } }),
    );
    return {
        agregando: cambio.isPending,
        agregar: async (variables: { idVariante: number; cantidad: number; nombre: string }) => {
            try {
                await cambio.mutateAsync(variables);
                avisar({
                    tipo: 'exito',
                    titulo: 'Agregado al carrito',
                    detalle: `${variables.nombre} · ${String(variables.cantidad)} u`,
                    accion: {
                        etiqueta: 'Ver carrito',
                        alElegir: () => void navegar('/carrito'),
                    },
                });
            } catch (error) {
                avisar({ tipo: 'error', titulo: 'No se pudo agregar', detalle: mensajeDe(error) });
            }
        },
    };
}

export function useLineaCarrito(idVariante: number) {
    const avisar = useAvisos();
    const alFallar = (error: unknown) => {
        avisar({ tipo: 'error', titulo: 'No se pudo actualizar', detalle: mensajeDe(error) });
    };
    const params = { idVariante };
    const cantidad = useCambioCarrito((valor: number) =>
        api.put('/carrito/items/{idVariante}', { params, cuerpo: { cantidad: valor } }),
    );
    const quitar = useCambioCarrito<undefined>(() => api.delete('/carrito/items/{idVariante}', { params }));
    return {
        recalculando: cantidad.isPending,
        quitando: quitar.isPending,
        cambiarCantidad: (valor: number) => {
            cantidad.mutate(valor, { onError: alFallar });
        },
        quitar: () => {
            quitar.mutate(undefined, { onError: alFallar });
        },
    };
}

export function useCuponCarrito() {
    const [codigo, setCodigo] = useState('');
    const [error, setError] = useState<string | undefined>();
    const aplicar = useCambioCarrito((valor: string) => api.post('/carrito/cupon', { cuerpo: { codigo: valor } }));
    const quitar = useCambioCarrito<undefined>(() => api.delete('/carrito/cupon'));
    return {
        codigo,
        setCodigo,
        error,
        aplicando: aplicar.isPending,
        quitando: quitar.isPending,
        aplicar: () => {
            const valor = codigo.trim();
            if (valor.length < LARGO_MINIMO_CUPON) {
                setError('Escribe el código del cupón.');
                return;
            }
            setError(undefined);
            aplicar.mutate(valor, {
                onSuccess: () => {
                    setCodigo('');
                },
                onError: (e) => {
                    setError(e.message);
                },
            });
        },
        quitar: () => {
            quitar.mutate(undefined);
        },
    };
}

export function useVaciarCarrito() {
    const [confirmando, setConfirmando] = useState(false);
    const vaciar = useCambioCarrito<undefined>(() => api.delete('/carrito'));
    return {
        confirmando,
        vaciando: vaciar.isPending,
        pedirConfirmacion: () => {
            setConfirmando(true);
        },
        cancelar: () => {
            setConfirmando(false);
        },
        confirmar: () => {
            vaciar.mutate(undefined, {
                onSettled: () => {
                    setConfirmando(false);
                },
            });
        },
    };
}
