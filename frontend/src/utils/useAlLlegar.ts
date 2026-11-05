import { useEffect, useRef } from 'react';

/**
 * Avisa cuando el elemento se acerca a la pantalla. Solo observa mientras `activo` es true y deja
 * de hacerlo al desmontar. El aviso más reciente siempre es el que se llama.
 */
export function useAlLlegar<T extends HTMLElement>(alLlegar: () => void, activo: boolean, margen = '400px') {
    const elemento = useRef<T>(null);
    const aviso = useRef(alLlegar);

    useEffect(() => {
        aviso.current = alLlegar;
    });

    useEffect(() => {
        const destino = elemento.current;
        if (!activo || !destino) return undefined;
        const observador = new IntersectionObserver(
            ([entrada]) => {
                if (entrada?.isIntersecting) aviso.current();
            },
            { rootMargin: margen },
        );
        observador.observe(destino);
        return () => {
            observador.disconnect();
        };
    }, [activo, margen]);

    return elemento;
}
