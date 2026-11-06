import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Pestaña de una pantalla, en la URL. La primera es la predeterminada y no aparece en la dirección.
 * Cambiar de pestaña limpia los demás parámetros: cada una tiene sus propios filtros.
 */
export function useVistaUrl<T extends string>(vistas: readonly { valor: T }[]) {
    const [parametros, setParametros] = useSearchParams();
    const leida = parametros.get('vista');
    const [primera] = vistas;
    const vista = (vistas.find((v) => v.valor === leida) ?? primera)?.valor as T;
    const elegir = useCallback(
        (nueva: T) => {
            setParametros(nueva === primera?.valor ? {} : { vista: nueva }, { preventScrollReset: true });
        },
        [setParametros, primera],
    );
    return { vista, elegir };
}
