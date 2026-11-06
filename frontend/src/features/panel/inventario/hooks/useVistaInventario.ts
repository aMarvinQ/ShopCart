import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { useVistaUrl } from '../../../../ui/useVistaUrl';

export const VISTAS = [
    { valor: 'existencias', etiqueta: 'Existencias' },
    { valor: 'kardex', etiqueta: 'Kardex' },
    { valor: 'conciliacion', etiqueta: 'Conciliación' },
] as const;

/** Pestaña activa, y atajo para ver el kardex de una variante. */
export function useVistaInventario() {
    const [, setParametros] = useSearchParams();
    const { vista, elegir } = useVistaUrl(VISTAS);
    const verKardexDe = useCallback(
        (idVariante: number) => {
            setParametros({ vista: 'kardex', variante: String(idVariante) });
        },
        [setParametros],
    );
    return { vista, elegir, verKardexDe };
}
