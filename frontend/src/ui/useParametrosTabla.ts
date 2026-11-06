import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { DireccionOrden, OrdenTabla } from './TablaDatos';

/*
    Página, orden y filtros de una tabla, guardados en la URL: se pueden compartir y sobreviven a
    recargar y al botón Atrás. Lo que venga en la URL se valida: una columna desconocida vuelve al
    orden por defecto en lugar de provocar un error de la API.
*/
export function useParametrosTabla<F extends string = never>({
    columnas,
    ordenPorDefecto,
    filtros = [],
}: {
    columnas: readonly string[];
    ordenPorDefecto: OrdenTabla;
    filtros?: readonly F[];
}) {
    const [parametros, setParametros] = useSearchParams();

    const leerDireccion = (): DireccionOrden | null => {
        const valor = parametros.get('direccion');
        return valor === 'ASC' || valor === 'DESC' ? valor : null;
    };
    const columna = parametros.get('ordenarPor');
    const ordenarPor = columna !== null && columnas.includes(columna) ? columna : ordenPorDefecto.ordenarPor;
    const direccion = leerDireccion() ?? ordenPorDefecto.direccion;

    const paginaUrl = Number(parametros.get('pagina'));
    const pagina = Number.isSafeInteger(paginaUrl) && paginaUrl >= 1 ? paginaUrl : 1;

    const valores = useMemo(
        () => Object.fromEntries(filtros.map((f) => [f, parametros.get(f) ?? ''])) as Record<F, string>,
        [filtros, parametros],
    );

    const irAPagina = useCallback(
        (nueva: number) => {
            setParametros((actuales) => {
                actuales.set('pagina', String(nueva));
                return actuales;
            });
        },
        [setParametros],
    );

    /* La misma columna invierte la dirección; otra empieza ascendente. Cambiar el orden vuelve a la página 1. */
    const ordenar = useCallback(
        (nueva: string) => {
            setParametros(
                (actuales) => {
                    actuales.set('ordenarPor', nueva);
                    actuales.set('direccion', nueva === ordenarPor && direccion === 'ASC' ? 'DESC' : 'ASC');
                    actuales.delete('pagina');
                    return actuales;
                },
                { replace: true },
            );
        },
        [setParametros, ordenarPor, direccion],
    );

    /* Varios a la vez: dos llamadas seguidas a setParametros se pisarían, porque parten de la misma URL. */
    const filtrarVarios = useCallback(
        (cambios: Partial<Record<F, string>>) => {
            setParametros(
                (actuales) => {
                    for (const [nombre, valor] of Object.entries<string | undefined>(cambios)) {
                        if (valor) actuales.set(nombre, valor);
                        else actuales.delete(nombre);
                    }
                    actuales.delete('pagina');
                    return actuales;
                },
                { replace: true },
            );
        },
        [setParametros],
    );

    const filtrar = useCallback(
        (nombre: F, valor: string) => {
            filtrarVarios({ [nombre]: valor } as Partial<Record<F, string>>);
        },
        [filtrarVarios],
    );

    /** Fija columna y dirección de una vez: lo usa el selector de orden en pantallas angostas. */
    const fijarOrden = useCallback(
        (columnaNueva: string, direccionNueva: DireccionOrden) => {
            setParametros(
                (actuales) => {
                    actuales.set('ordenarPor', columnaNueva);
                    actuales.set('direccion', direccionNueva);
                    actuales.delete('pagina');
                    return actuales;
                },
                { replace: true },
            );
        },
        [setParametros],
    );

    /** Quita los filtros; conserva el orden, que no es un filtro. */
    const limpiarFiltros = useCallback(() => {
        setParametros(
            (actuales) => {
                for (const nombre of filtros) actuales.delete(nombre);
                actuales.delete('pagina');
                return actuales;
            },
            { replace: true },
        );
    }, [setParametros, filtros]);

    return {
        pagina,
        orden: { ordenarPor, direccion },
        filtros: valores,
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        filtrarVarios,
        limpiarFiltros,
    };
}
