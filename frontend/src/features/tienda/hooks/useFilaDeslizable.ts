import { useCallback, useEffect, useRef, useState } from 'react';

/** Flechas de una fila con scroll horizontal: se apagan en los extremos y se recalculan al cambiar el ancho. */
export function useFilaDeslizable(cantidad: number) {
    const pista = useRef<HTMLDivElement>(null);
    const [puede, setPuede] = useState({ atras: false, adelante: false });

    const medir = useCallback(() => {
        const el = pista.current;
        if (!el) return;
        const atras = el.scrollLeft > 1;
        const adelante = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
        setPuede((actual) => (actual.atras === atras && actual.adelante === adelante ? actual : { atras, adelante }));
    }, []);

    useEffect(() => {
        const el = pista.current;
        if (!el) return undefined;
        medir();
        const observador = new ResizeObserver(medir);
        observador.observe(el);
        return () => {
            observador.disconnect();
        };
    }, [medir, cantidad]);

    const mover = (sentido: 1 | -1) => {
        const el = pista.current;
        el?.scrollBy({ left: sentido * el.clientWidth, behavior: 'smooth' });
    };

    return { pista, puede, medir, mover };
}
