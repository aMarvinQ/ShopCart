import { useCallback, useEffect, useRef } from 'react';
import { useBlocker } from 'react-router';

/**
 * Evita perder cambios: pide confirmar al navegar dentro de la app y activa el aviso del navegador al
 * cerrar o recargar. `permitirSalida` lo apaga antes de navegar a propósito, por ejemplo tras guardar.
 */
export function useAvisoSalida(hayCambios: boolean) {
    const permitida = useRef(false);
    const bloqueador = useBlocker(() => hayCambios && !permitida.current);

    useEffect(() => {
        if (!hayCambios) return undefined;
        const alSalir = (evento: BeforeUnloadEvent) => {
            evento.preventDefault();
        };
        window.addEventListener('beforeunload', alSalir);
        return () => {
            window.removeEventListener('beforeunload', alSalir);
        };
    }, [hayCambios]);

    return {
        bloqueado: bloqueador.state === 'blocked',
        quedarse: () => {
            bloqueador.reset?.();
        },
        salir: () => {
            bloqueador.proceed?.();
        },
        permitirSalida: useCallback(() => {
            permitida.current = true;
        }, []),
    };
}
