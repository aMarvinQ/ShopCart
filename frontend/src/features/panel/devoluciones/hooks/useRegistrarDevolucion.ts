import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../../api/cliente';
import { useTrasAccion, type PedidoPanel } from '../../pedidos/hooks/useGestionPedido';

interface LineaElegida {
    incluida: boolean;
    cantidad: number;
    reingresa: boolean;
}

const ESTADOS_CON_DEVOLUCION = ['ENTREGADO', 'DEVUELTO_PARCIAL'];

const porDevolver = (linea: PedidoPanel['lineas'][number]) => linea.cantidad - linea.cantidadDevuelta;

/** Lo que el pedido todavía permite devolver; el plazo y lo demás los valida la API. */
export const lineasDevolvibles = (pedido: PedidoPanel) =>
    ESTADOS_CON_DEVOLUCION.includes(pedido.codigoEstado) ? pedido.lineas.filter((l) => porDevolver(l) > 0) : [];

/** Formulario de devolución. El reembolso lo calcula la API: aquí no se estima ningún monto. */
export function useRegistrarDevolucion(pedido: PedidoPanel, alTerminar: () => void) {
    const lineas = lineasDevolvibles(pedido);
    const { alCompletar, alFallar } = useTrasAccion();
    const [elegidas, setElegidas] = useState<Partial<Record<number, LineaElegida>>>({});
    const [motivo, setMotivo] = useState('');
    const [errorMotivo, setErrorMotivo] = useState<string | undefined>();
    const [errorLineas, setErrorLineas] = useState<string | null>(null);
    const [confirmando, setConfirmando] = useState(false);

    const estadoDe = (idLinea: number): LineaElegida =>
        elegidas[idLinea] ?? { incluida: false, cantidad: 1, reingresa: true };

    const cambiar = (idLinea: number, cambios: Partial<LineaElegida>) => {
        setErrorLineas(null);
        setElegidas((actuales) => ({ ...actuales, [idLinea]: { ...estadoDe(idLinea), ...cambios } }));
    };

    const incluidas = lineas
        .map((l) => ({ idPedidoDetalle: l.idPedidoDetalle, ...estadoDe(l.idPedidoDetalle) }))
        .filter((l) => l.incluida);

    const registrar = useMutation({
        mutationFn: () =>
            api.post('/pedidos/{id}/devoluciones', {
                params: { id: pedido.idPedido },
                cuerpo: {
                    motivo: motivo.trim(),
                    lineas: incluidas.map(({ idPedidoDetalle, cantidad, reingresa }) => ({
                        idPedidoDetalle,
                        cantidad,
                        reingresa,
                    })),
                },
            }),
        onSuccess: async (respuesta) => {
            setConfirmando(false);
            await alCompletar(respuesta, 'Devolución registrada');
            alTerminar();
        },
        onError: async (error) => {
            setConfirmando(false);
            await alFallar(pedido.idPedido, 'No se pudo registrar la devolución', error);
        },
    });

    return {
        lineas,
        estadoDe,
        maximoDe: porDevolver,
        cambiar,
        motivo,
        errorMotivo,
        errorLineas,
        confirmando,
        registrando: registrar.isPending,
        unidades: incluidas.reduce((suma, l) => suma + l.cantidad, 0),
        escribirMotivo: (texto: string) => {
            setMotivo(texto);
            setErrorMotivo(undefined);
        },
        pedirConfirmacion: () => {
            if (incluidas.length === 0) setErrorLineas('Elige al menos un producto.');
            if (!motivo.trim()) setErrorMotivo('Escribe el motivo de la devolución.');
            if (incluidas.length > 0 && motivo.trim()) setConfirmando(true);
        },
        desistir: () => {
            setConfirmando(false);
        },
        confirmar: () => {
            registrar.mutate();
        },
    };
}
