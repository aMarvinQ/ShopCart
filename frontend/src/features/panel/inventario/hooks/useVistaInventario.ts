import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

export const VISTAS = [
    { valor: 'existencias', etiqueta: 'Existencias' },
    { valor: 'kardex', etiqueta: 'Kardex' },
    { valor: 'conciliacion', etiqueta: 'Conciliación' },
] as const;
export type Vista = (typeof VISTAS)[number]['valor'];

/** Pestaña activa en la URL. Cambiar de pestaña limpia los filtros: cada una tiene los suyos. */
export function useVistaInventario() {
    const [parametros, setParametros] = useSearchParams();
    const leida = parametros.get('vista');
    const vista = VISTAS.find((v) => v.valor === leida)?.valor ?? 'existencias';
    const elegir = useCallback(
        (nueva: Vista) => {
            setParametros(nueva === 'existencias' ? {} : { vista: nueva }, { preventScrollReset: true });
        },
        [setParametros],
    );
    const verKardexDe = useCallback(
        (idVariante: number) => {
            setParametros({ vista: 'kardex', variante: String(idVariante) });
        },
        [setParametros],
    );
    return { vista, elegir, verKardexDe };
}
