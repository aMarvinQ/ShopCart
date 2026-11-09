import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../../api/cliente';
import { esErrorApi } from '../../../../api/errores';
import { CLAVE_PARAMETROS, type Parametro } from './useParametros';

const FORMATO = { ENTERO: /^-?\d+$/, DECIMAL: /^-?\d+(\.\d{1,6})?$/ } as const;

export const numero = (valor: number) => valor.toLocaleString('en-US', { maximumFractionDigits: 6 });

/** Rango legible, como "1 y 120 minutos"; null si el parámetro no es numérico. */
export function textoRango({ valorMinimo, valorMaximo }: Parametro, unidad?: string): string | null {
    if (valorMinimo === null || valorMaximo === null) return null;
    return `${numero(valorMinimo)} y ${numero(valorMaximo)}${unidad ? ` ${unidad}` : ''}`;
}

/** La misma regla del SP (tipo y rango), para avisar antes de enviar. */
function validar(parametro: Parametro, valor: string, unidad?: string): string | null {
    if (valor === '') return 'Escribe un valor.';
    const formato = FORMATO[parametro.tipoDato as keyof typeof FORMATO] as RegExp | undefined;
    if (!formato) return valor.length > 200 ? 'Máximo 200 caracteres.' : null;
    if (!formato.test(valor)) {
        return parametro.tipoDato === 'ENTERO' ? 'Escribe un número entero.' : 'Escribe un número, como 0.12.';
    }
    const rango = textoRango(parametro, unidad);
    const { valorMinimo, valorMaximo } = parametro;
    if (rango && valorMinimo !== null && valorMaximo !== null) {
        const n = Number(valor);
        if (n < valorMinimo || n > valorMaximo) return `Debe estar entre ${rango}.`;
    }
    return null;
}

/** Valores iguales aunque se escriban distinto ("07" y "7"): el SP no guarda nada en ese caso. */
const mismoValor = (parametro: Parametro, valor: string) =>
    parametro.tipoDato in FORMATO ? Number(valor) === Number(parametro.valor) : valor === parametro.valor;

/*
    Cada parámetro se guarda por separado. Lo escrito vive en la tarjeta (borrador): guardar uno
    actualiza la lista sin tocar lo que se esté escribiendo en otro.
*/
export function useParametro(parametro: Parametro, unidad?: string) {
    const consultas = useQueryClient();
    const [borrador, setBorrador] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);
    const valor = borrador ?? parametro.valor;
    const pendiente = borrador !== null && !mismoValor(parametro, borrador.trim());

    const guardar = useMutation({
        mutationFn: (nuevo: string) =>
            api.put('/parametros/{clave}', {
                params: { clave: parametro.clave },
                cuerpo: { valor: nuevo, versionFila: parametro.versionFila },
            }),
        onSuccess: ({ data }) => {
            consultas.setQueryData<{ data: Parametro[] }>(CLAVE_PARAMETROS, (actual) =>
                actual ? { ...actual, data: actual.data.map((p) => (p.clave === data.clave ? data : p)) } : actual,
            );
            setBorrador(null);
            setGuardado(true);
        },
        onError: async (e) => {
            setError(esErrorApi(e) ? e.message : 'No se pudo guardar; intenta de nuevo.');
            // Otro administrador lo cambió: se trae lo real y lo escrito se conserva.
            if (esErrorApi(e) && e.codigo === 'EDICION_CONCURRENTE') {
                await consultas.invalidateQueries({ queryKey: CLAVE_PARAMETROS });
            }
        },
    });

    return {
        valor,
        pendiente,
        error,
        guardado: guardado && borrador === null,
        guardando: guardar.isPending,
        cambiar: (texto: string) => {
            setBorrador(texto);
            setError(null);
            setGuardado(false);
        },
        descartar: () => {
            setBorrador(null);
            setError(null);
        },
        enviar: () => {
            const limpio = valor.trim();
            const problema = validar(parametro, limpio, unidad);
            if (problema) {
                setError(problema);
                return;
            }
            if (pendiente) guardar.mutate(limpio);
        },
    };
}
