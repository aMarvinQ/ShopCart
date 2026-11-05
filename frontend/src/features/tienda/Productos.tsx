import { SearchX, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { esErrorApi } from '../../api/errores';
import { Boton } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Chip, Interruptor, Radio } from '../../ui/Controles';
import { Cajon, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { MigaPan, Tarjeta } from '../../ui/Navegacion';
import { Selector } from '../../ui/Selector';
import { moneda } from '../../utils/formato';
import { useAlLlegar } from '../../utils/useAlLlegar';
import { MAXIMO_PAGINAS, useBusquedaProductos, useCategorias, type FiltrosProductos } from './consultas';
import { EsqueletoTarjeta, TarjetaProducto } from './TarjetaProducto';
import estilos from './tienda.module.scss';

const ORDENES = [
    { valor: 'recientes', etiqueta: 'Más recientes', ordenarPor: 'RECIENTES', direccion: 'DESC' },
    { valor: 'precio-asc', etiqueta: 'Precio: menor a mayor', ordenarPor: 'PRECIO', direccion: 'ASC' },
    { valor: 'precio-desc', etiqueta: 'Precio: mayor a menor', ordenarPor: 'PRECIO', direccion: 'DESC' },
    { valor: 'nombre', etiqueta: 'Nombre: A a Z', ordenarPor: 'NOMBRE', direccion: 'ASC' },
] as const;

const leerMonto = (valor: string | null) => {
    if (valor === null || valor.trim() === '') return undefined;
    const numero = Number(valor);
    return Number.isFinite(numero) && numero >= 0 ? numero : undefined;
};

/** Traduce la URL a filtros válidos para la API: lo que no se entienda se ignora. */
function filtrosDeUrl(parametros: URLSearchParams) {
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

function FiltroPrecio({
    minimo,
    maximo,
    alAplicar,
}: {
    minimo: number | undefined;
    maximo: number | undefined;
    alAplicar: (minimo: string, maximo: string) => void;
}) {
    const [desde, setDesde] = useState(minimo?.toString() ?? '');
    const [hasta, setHasta] = useState(maximo?.toString() ?? '');
    const invertido = desde !== '' && hasta !== '' && Number(desde) > Number(hasta);
    return (
        <form
            className={estilos.filtroPrecio}
            onSubmit={(evento) => {
                evento.preventDefault();
                if (!invertido) alAplicar(desde, hasta);
            }}
        >
            <div className={estilos.filtroPrecioCampos}>
                <Campo
                    etiqueta="Mínimo"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={desde}
                    onChange={({ target }) => {
                        setDesde(target.value);
                    }}
                />
                <Campo
                    etiqueta="Máximo"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={hasta}
                    error={invertido ? 'Menor que el mínimo' : undefined}
                    onChange={({ target }) => {
                        setHasta(target.value);
                    }}
                />
            </div>
            <Boton type="submit" variante="secundario" tamano="sm" disabled={invertido}>
                Aplicar precio
            </Boton>
        </form>
    );
}

export default function Productos() {
    const [parametros, setParametros] = useSearchParams();
    const { filtros, orden } = useMemo(() => filtrosDeUrl(parametros), [parametros]);
    const [cajon, setCajon] = useState(false);
    const categorias = useCategorias().data?.data ?? [];
    const categoria = categorias.find((c) => c.slug === filtros.categoria);
    const busqueda = useBusquedaProductos(filtros);

    const productos = useMemo(() => busqueda.data?.pages.flatMap((p) => p.data) ?? [], [busqueda.data]);
    const total = busqueda.data?.pages[0]?.meta.totalRegistros;
    const paginas = busqueda.data?.pages.length ?? 0;
    const topeAlcanzado = paginas >= MAXIMO_PAGINAS && !busqueda.hasNextPage && productos.length < (total ?? 0);

    const final = useAlLlegar<HTMLDivElement>(
        () => void busqueda.fetchNextPage(),
        busqueda.hasNextPage && !busqueda.isFetchingNextPage && !busqueda.isError,
    );

    const cambiar = (cambios: Record<string, string | null>) => {
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
    };

    const chips: { id: string; etiqueta: string; quitar: Record<string, null> }[] = [];
    if (filtros.texto) chips.push({ id: 'texto', etiqueta: `“${filtros.texto}”`, quitar: { texto: null } });
    if (categoria) chips.push({ id: 'categoria', etiqueta: categoria.nombre, quitar: { categoria: null } });
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

    const panelFiltros = (
        <>
            <fieldset className={estilos.filtroGrupo}>
                <legend>Categoría</legend>
                <Radio
                    name="categoria"
                    etiqueta="Todas"
                    checked={!filtros.categoria}
                    onChange={() => {
                        cambiar({ categoria: null });
                    }}
                />
                {categorias.map((c) => (
                    <Radio
                        key={c.idCategoria}
                        name="categoria"
                        etiqueta={c.nombre}
                        contador={c.productosVisibles}
                        checked={filtros.categoria === c.slug}
                        onChange={() => {
                            cambiar({ categoria: c.slug });
                        }}
                    />
                ))}
            </fieldset>
            <fieldset className={estilos.filtroGrupo}>
                <legend>Precio</legend>
                <FiltroPrecio
                    key={`${String(filtros.precioMinimo)}-${String(filtros.precioMaximo)}`}
                    minimo={filtros.precioMinimo}
                    maximo={filtros.precioMaximo}
                    alAplicar={(precioMinimo, precioMaximo) => {
                        cambiar({ precioMinimo, precioMaximo });
                    }}
                />
            </fieldset>
            <fieldset className={estilos.filtroGrupo}>
                <legend>Disponibilidad</legend>
                <Interruptor
                    etiqueta="Solo en existencia"
                    checked={filtros.soloDisponibles === 'true'}
                    onChange={({ target }) => {
                        cambiar({ disponibles: target.checked ? '1' : null });
                    }}
                />
            </fieldset>
        </>
    );

    const titulo = categoria?.nombre ?? (filtros.texto ? `Resultados de “${filtros.texto}”` : 'Todos los productos');

    return (
        <div className={estilos.busqueda}>
            <title>{`${titulo} · ShopCart`}</title>
            <MigaPan rutas={[{ etiqueta: 'Inicio', a: '/' }, { etiqueta: titulo }]} />
            <div className={estilos.busquedaCabecera}>
                <div>
                    <h1>{titulo}</h1>
                    <p aria-live="polite">
                        {total === undefined
                            ? '\u00a0'
                            : `${String(total)} ${total === 1 ? 'producto' : 'productos'} · precios incluyen IVA`}
                    </p>
                </div>
                <div className={estilos.busquedaControles}>
                    <span className={estilos.soloMovil}>
                        <Boton
                            variante="secundario"
                            icono={SlidersHorizontal}
                            onClick={() => {
                                setCajon(true);
                            }}
                        >
                            {chips.length > 0 ? `Filtros (${String(chips.length)})` : 'Filtros'}
                        </Boton>
                    </span>
                    <Selector
                        etiqueta="Ordenar por"
                        compacto
                        ancho="14rem"
                        valor={orden}
                        opciones={ORDENES}
                        alCambiar={(valor) => {
                            cambiar({ orden: valor === 'recientes' ? null : valor });
                        }}
                    />
                </div>
            </div>
            <div className={estilos.busquedaCuerpo}>
                <aside className={estilos.filtros}>
                    <Tarjeta className={estilos.filtrosTarjeta}>{panelFiltros}</Tarjeta>
                </aside>
                <Cajon
                    mostrar={cajon}
                    titulo="Filtros"
                    alCerrar={() => {
                        setCajon(false);
                    }}
                    pie={
                        <Boton
                            anchoCompleto
                            onClick={() => {
                                setCajon(false);
                            }}
                        >
                            {total === undefined ? 'Ver productos' : `Ver ${String(total)} productos`}
                        </Boton>
                    }
                >
                    {panelFiltros}
                </Cajon>
                <div className={estilos.resultados}>
                    {chips.length > 0 && (
                        <div className={estilos.chips}>
                            {chips.map((c) => (
                                <Chip
                                    key={c.id}
                                    etiqueta={c.etiqueta}
                                    alQuitar={() => {
                                        cambiar(c.quitar);
                                    }}
                                />
                            ))}
                            <button
                                type="button"
                                className={estilos.limpiar}
                                onClick={() => {
                                    setParametros(orden === 'recientes' ? {} : { orden }, { replace: true });
                                }}
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    )}
                    {busqueda.isError && productos.length === 0 ? (
                        <EstadoError
                            titulo="No pudimos cargar los productos"
                            mensaje={busqueda.error.message}
                            referencia={esErrorApi(busqueda.error) ? busqueda.error.requestId : undefined}
                            alReintentar={() => void busqueda.refetch()}
                        />
                    ) : total === 0 ? (
                        <EstadoVacio
                            icono={SearchX}
                            titulo="No encontramos productos"
                            mensaje="Prueba con otros filtros u otra búsqueda."
                        />
                    ) : (
                        <div className={estilos.rejilla}>
                            {productos.map((p, i) => (
                                <TarjetaProducto key={p.idProducto} producto={p} prioridad={i < 8} />
                            ))}
                            {(busqueda.isPending || busqueda.isFetchingNextPage) &&
                                Array.from({ length: 8 }, (_, i) => <EsqueletoTarjeta key={i} />)}
                        </div>
                    )}
                    <div ref={final} className={estilos.finalLista} aria-live="polite">
                        {busqueda.isFetchingNextPage && 'Cargando más productos…'}
                        {busqueda.isFetchNextPageError && (
                            <Boton variante="secundario" tamano="sm" onClick={() => void busqueda.fetchNextPage()}>
                                Reintentar
                            </Boton>
                        )}
                        {topeAlcanzado && 'Afina los filtros para ver más productos.'}
                    </div>
                </div>
            </div>
        </div>
    );
}
