import { SearchX, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { esErrorApi } from '../../api/errores';
import { Boton } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Chip, Interruptor, Radio } from '../../ui/Controles';
import { Cajon, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { MigaPan, Tarjeta } from '../../ui/Navegacion';
import { Selector } from '../../ui/Selector';
import { ORDENES, useFiltroPrecio, useListaProductos } from './hooks/useListaProductos';
import { EsqueletoTarjeta, TarjetaProducto } from './TarjetaProducto';
import estilos from './tienda.module.scss';

function FiltroPrecio({
    minimo,
    maximo,
    alAplicar,
}: {
    minimo: number | undefined;
    maximo: number | undefined;
    alAplicar: (minimo: string, maximo: string) => void;
}) {
    const { desde, setDesde, hasta, setHasta, invertido } = useFiltroPrecio(minimo, maximo);
    return (
        <form
            className={estilos.filtroPrecio}
            onSubmit={(evento) => {
                evento.preventDefault();
                if (!invertido) alAplicar(desde, hasta);
            }}
        >
            <div className="row gx-2">
                <div className="col-6">
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
                </div>
                <div className="col-6">
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
            </div>
            <Boton type="submit" variante="secundario" tamano="sm" disabled={invertido}>
                Aplicar precio
            </Boton>
        </form>
    );
}

export default function Productos() {
    const {
        filtros,
        orden,
        categorias,
        chips,
        titulo,
        productos,
        total,
        busqueda,
        topeAlcanzado,
        refFinal,
        cambiar,
        limpiar,
    } = useListaProductos();
    const [cajon, setCajon] = useState(false);

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
                    <span className="d-lg-none">
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
            <div className="row g-4">
                <aside className="col-lg-3 d-none d-lg-block">
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
                <div className="col-lg-9">
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
                            <Boton variante="enlace" tamano="sm" onClick={limpiar}>
                                Limpiar filtros
                            </Boton>
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
                        <div className="row row-cols-2 row-cols-md-3 row-cols-xl-4 g-3 g-md-4">
                            {productos.map((p, i) => (
                                <div key={p.idProducto} className="col">
                                    <TarjetaProducto producto={p} prioridad={i < 8} />
                                </div>
                            ))}
                            {(busqueda.isPending || busqueda.isFetchingNextPage) &&
                                Array.from({ length: 8 }, (_, i) => (
                                    <div key={i} className="col">
                                        <EsqueletoTarjeta />
                                    </div>
                                ))}
                        </div>
                    )}
                    <div ref={refFinal} className={estilos.finalLista} aria-live="polite">
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
