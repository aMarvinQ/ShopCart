import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { CLAVE_PRODUCTOS } from '../../catalogo/productos/hooks/useProductosPanel';
import { CLAVE_INVENTARIO } from '../../pedidos/hooks/useGestionPedido';
import type { FilaExistencia } from './useExistencias';

export const TIPOS_MOVIMIENTO = [
    { valor: 'ENTRADA_COMPRA', etiqueta: 'Entrada por compra' },
    { valor: 'AJUSTE_ENTRADA', etiqueta: 'Ajuste de entrada' },
    { valor: 'AJUSTE_SALIDA', etiqueta: 'Ajuste de salida' },
] as const;
type TipoManual = (typeof TIPOS_MOVIMIENTO)[number]['valor'];

export interface LineaMovimiento {
    idVariante: number;
    sku: string;
    producto: string;
    descripcion: string;
    disponible: number;
    cantidad: string;
}

const MAXIMO_LINEAS = 200;
const MAXIMO_CANTIDAD = 100_000;
const RESULTADOS = 20;

/** Lo que el movimiento necesita saber de una variante. */
export type VarianteMovimiento = Pick<FilaExistencia, 'idVariante' | 'sku' | 'producto' | 'descripcion' | 'disponible'>;

const lineaDe = (fila: VarianteMovimiento): LineaMovimiento => ({
    idVariante: fila.idVariante,
    sku: fila.sku,
    producto: fila.producto,
    descripcion: fila.descripcion,
    disponible: fila.disponible,
    cantidad: '1',
});

const cantidadValida = (texto: string) => {
    const numero = Number(texto);
    return Number.isInteger(numero) && numero >= 1 && numero <= MAXIMO_CANTIDAD;
};

/** Variantes que coinciden con lo escrito: el campo ya espera a que se deje de escribir. */
export function useBuscarVariantes(texto: string) {
    return useQuery({
        queryKey: [...CLAVE_INVENTARIO, 'buscar-variante', texto],
        queryFn: ({ signal }) =>
            api.get('/inventario/existencias', {
                query: { busqueda: texto, pagina: 1, tamanoPagina: RESULTADOS },
                signal,
            }),
        enabled: texto !== '',
        staleTime: 15_000,
    });
}

/**
 * Entrada o ajuste de una o varias variantes: la API lo registra todo en una sola transacción.
 * Con `fijas` las líneas ya están puestas, sin cantidad, y solo se registran las que la lleven.
 */
export function useMovimiento(
    inicial: FilaExistencia | null,
    alTerminar: () => void,
    fijas?: readonly VarianteMovimiento[],
) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [tipo, setTipo] = useState<TipoManual>('ENTRADA_COMPRA');
    const [lineas, setLineas] = useState<LineaMovimiento[]>(() => {
        if (fijas) return fijas.map((v) => ({ ...lineaDe(v), cantidad: '' }));
        return inicial ? [lineaDe(inicial)] : [];
    });
    const [motivo, setMotivo] = useState('');
    const [errorMotivo, setErrorMotivo] = useState<string | undefined>();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const [mostrarErrores, setMostrarErrores] = useState(false);

    const esAjuste = tipo !== 'ENTRADA_COMPRA';
    const porRegistrar = fijas ? lineas.filter((l) => l.cantidad.trim() !== '') : lineas;

    const registrar = useMutation({
        mutationFn: () =>
            api.post('/inventario/movimientos', {
                cuerpo: {
                    tipo,
                    ...(motivo.trim() && { motivo: motivo.trim() }),
                    lineas: porRegistrar.map((l) => ({ idVariante: l.idVariante, cantidad: Number(l.cantidad) })),
                },
            }),
        onSuccess: async ({ data }) => {
            const [unico] = data;
            avisar({
                tipo: 'exito',
                titulo: 'Movimiento registrado',
                detalle:
                    data.length === 1 && unico
                        ? `${unico.sku}: ${String(unico.saldoAnterior)} → ${String(unico.saldoNuevo)} u`
                        : `${String(data.length)} variantes actualizadas`,
            });
            alTerminar();
            await Promise.all([
                consultas.invalidateQueries({ queryKey: CLAVE_INVENTARIO }),
                // La existencia también se ve en el catálogo.
                consultas.invalidateQueries({ queryKey: CLAVE_PRODUCTOS }),
            ]);
        },
        onError: (error) => {
            setErrorGeneral(error.message);
        },
    });

    return {
        tipo,
        elegirTipo: setTipo,
        esAjuste,
        lineas,
        motivo,
        errorMotivo,
        errorGeneral,
        mostrarErrores,
        registrando: registrar.isPending,
        fijas: fijas !== undefined,
        cantidadValida: (texto: string) => (fijas !== undefined && texto.trim() === '') || cantidadValida(texto),
        escribirMotivo: (texto: string) => {
            setMotivo(texto);
            setErrorMotivo(undefined);
        },
        agregar: (fila: FilaExistencia) => {
            setErrorGeneral(null);
            setLineas((actuales) =>
                actuales.some((l) => l.idVariante === fila.idVariante) || actuales.length >= MAXIMO_LINEAS
                    ? actuales
                    : [...actuales, lineaDe(fila)],
            );
        },
        quitar: (idVariante: number) => {
            setLineas((actuales) => actuales.filter((l) => l.idVariante !== idVariante));
        },
        cambiarCantidad: (idVariante: number, cantidad: string) => {
            setLineas((actuales) => actuales.map((l) => (l.idVariante === idVariante ? { ...l, cantidad } : l)));
        },
        enviar: () => {
            setErrorGeneral(null);
            setMostrarErrores(true);
            const sinMotivo = esAjuste && !motivo.trim();
            if (sinMotivo) setErrorMotivo('El motivo es obligatorio en los ajustes.');
            if (porRegistrar.length === 0) {
                setErrorGeneral(
                    fijas ? 'Escribe la cantidad de al menos una variante.' : 'Agrega al menos una variante.',
                );
                return;
            }
            if (!sinMotivo && porRegistrar.every((l) => cantidadValida(l.cantidad))) registrar.mutate();
        },
    };
}
