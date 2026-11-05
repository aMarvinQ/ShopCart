import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { moneda } from '../../../utils/formato';
import { useAlLlegar } from '../../../utils/useAlLlegar';
import { MAXIMO_PAGINAS, useBusquedaProductos, useCategorias, type FiltrosProductos } from './useCatalogo';

export const ORDENES = [
    { valor: 'recientes', etiqueta: 'Más recientes', ordenarPor: 'RECIENTES', direccion: 'DESC' },
    { valor: 'precio-asc', etiqueta: 'Precio: menor a mayor', ordenarPor: 'PRECIO', direccion: 'ASC' },
    { valor: 'precio-desc', etiqueta: 'Precio: mayor a menor', ordenarPor: 'PRECIO', direccion: 'DESC' },
    { valor: 'nombre', etiqueta: 'Nombre: A a Z', ordenarPor: 'NOMBRE', direccion: 'ASC' },
] as const;

type CambiosUrl = Record<string, string | null>;

export interface ChipFiltro {
    id: string;
    etiqueta: string;
    quitar: CambiosUrl;
}

const leerMonto = (valor: string | null) => {
    if (valor === null || valor.trim() === '') return undefined;
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : undefined;
};

/** Traduce la URL a filtros válidos para la API: lo que no se entienda se ignora. */
export function filtrosDeUrl(parametros: URLSearchParams) {
    const orden = ORDENES.find((o) => o.valor === parametros.get('orden')) ?? ORDENES[0];
    const texto = parametros.get('texto')?.trim().slice(0, 100);
    const categoria = parametros.get('categoria');
    const precioMinimo = leerMonto(parametros.get('precioMinimo'));
    const precioMaximo = leerMonto(parametros.get('precioMaximo'));
    const filtros: FiltrosProductos = {
        ordenarPor: orden.ordenarPor,
        direccion: orden.direccion,
        ...(texto && { texto }),
        ...(categoria && { categoria }),
        ...(precioMinimo !== undefined && { precioMinimo }),
        ...(precioMaximo !== undefined && { precioMaximo }),
        ...(parametros.get('disponibles') === '1' && { soloDisponibles: 'true' as const }),
    };
    return { filtros, orden: orden.valor };
}

function chipsDe(filtros: FiltrosProductos, nombreCategoria: string | undefined): ChipFiltro[] {
    const chips: ChipFiltro[] = [];
    if (filtros.texto) chips.push({ id: 'texto', etiqueta: `“${filtros.texto}”`, quitar: { texto: null } });
    if (nombreCategoria) chips.push({ id: 'categoria', etiqueta: nombreCategoria, quitar: { categoria: null } });
    if (filtros.precioMinimo !== undefined || filtros.precioMaximo !== undefined) {
        const desde = filtros.precioMinimo === undefined ? null : moneda(filtros.precioMinimo);
        const hasta = filtros.precioMaximo === undefined ? null : moneda(filtros.precioMaximo);
        chips.push({
            id: 'precio',
            etiqueta: desde && hasta ? `${desde} – ${hasta}` : desde ? `Desde ${desde}` : `Hasta ${hasta ?? ''}`,
            quitar: { precioMinimo: null, precioMaximo: null },
        });
    }
    if (filtros.soloDisponibles) {
        chips.push({ id: 'disponibles', etiqueta: 'En existencia', quitar: { disponibles: null } });
    }
    return chips;
}

/** Todo lo que la pantalla de búsqueda necesita: filtros en la URL, resultados y carga al llegar al final. */
export function useListaProductos() {
    const [parametros, setParametros] = useSearchParams();
    const { filtros, orden } = useMemo(() => filtrosDeUrl(parametros), [parametros]);
    const categorias = useCategorias().data?.data ?? [];
    const categoria = categorias.find((c) => c.slug === filtros.categoria);
    const busqueda = useBusquedaProductos(filtros);

    const productos = useMemo(() => busqueda.data?.pages.flatMap((p) => p.data) ?? [], [busqueda.data]);
    const total = busqueda.data?.pages[0]?.meta.totalRegistros;
    const paginas = busqueda.data?.pages.length ?? 0;

    const refFinal = useAlLlegar<HTMLDivElement>(
        () => void busqueda.fetchNextPage(),
        busqueda.hasNextPage && !busqueda.isFetchingNextPage && !busqueda.isError,
    );

    const cambiar = useCallback(
        (cambios: CambiosUrl) => {
            setParametros(
                (actuales) => {
                    for (const [clave, valor] of Object.entries(cambios)) {
                        if (valor) actuales.set(clave, valor);
                        else actuales.delete(clave);
                    }
                    return actuales;
                },
                { replace: true },
            );
        },
        [setParametros],
    );

    const limpiar = () => {
        setParametros(orden === 'recientes' ? {} : { orden }, { replace: true });
    };

    return {
        filtros,
        orden,
        categorias,
        chips: chipsDe(filtros, categoria?.nombre),
        titulo: categoria?.nombre ?? (filtros.texto ? `Resultados de “${filtros.texto}”` : 'Todos los productos'),
        productos,
        total,
        busqueda,
        topeAlcanzado: paginas >= MAXIMO_PAGINAS && !busqueda.hasNextPage && productos.length < (total ?? 0),
        refFinal,
        cambiar,
        limpiar,
    };
}

/** Rango de precios de los filtros: se aplica al enviar, no en cada tecla. */
export function useFiltroPrecio(minimo: number | undefined, maximo: number | undefined) {
    const [desde, setDesde] = useState(minimo?.toString() ?? '');
    const [hasta, setHasta] = useState(maximo?.toString() ?? '');
    return {
        desde,
        setDesde,
        hasta,
        setHasta,
        invertido: desde !== '' && hasta !== '' && Number(desde) > Number(hasta),
    };
}

/** Buscador de la barra: lleva a la lista con el texto en la URL y se actualiza si la URL cambia. */
export function useBuscadorTienda() {
    const navegar = useNavigate();
    const [parametros] = useSearchParams();
    const enUrl = parametros.get('texto') ?? '';
    const [texto, setTexto] = useState(enUrl);
    const [anterior, setAnterior] = useState(enUrl);
    if (enUrl !== anterior) {
        setAnterior(enUrl);
        setTexto(enUrl);
    }
    const buscar = () => {
        const valor = texto.trim();
        void navegar(valor ? `/productos?texto=${encodeURIComponent(valor)}` : '/productos');
    };
    return { texto, setTexto, buscar };
}
