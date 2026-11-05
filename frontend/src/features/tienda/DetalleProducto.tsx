import { PackageX, ShoppingCart, TriangleAlert, Truck } from 'lucide-react';
import { useParams } from 'react-router';
import { esErrorApi } from '../../api/errores';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { Cantidad } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { MigaPan } from '../../ui/Navegacion';
import { moneda } from '../../utils/formato';
import { FilaProductos } from './FilaProductos';
import { useDetalleProducto, useMetodosEnvio, type DetalleDeProducto } from './hooks/useCatalogo';
import { useCompraProducto } from './hooks/useCompraProducto';
import { ImagenProducto } from './TarjetaProducto';
import { textoPlazo } from './textos';
import estilos from './tienda.module.scss';

function MetodosEnvio() {
    const { data } = useMetodosEnvio();
    if (!data || data.data.length === 0) return null;
    return (
        <ul className={`list-group ${estilos.metodos}`}>
            {data.data.map((m) => (
                <li key={m.idMetodoEnvio} className="list-group-item">
                    <Truck size={20} aria-hidden="true" />
                    <div>
                        <strong>{m.nombre}</strong>
                        <p>
                            {textoPlazo(m.diasEstimadosMin, m.diasEstimadosMax)} ·{' '}
                            {m.costo === 0 ? 'sin costo' : moneda(m.costo)}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function Contenido({ producto }: { producto: DetalleDeProducto }) {
    const compra = useCompraProducto(producto);
    const { variante, grupos, imagenes, imagen, cantidad, disponible, agotado, pocasUnidades } = compra;

    const botonAgregar = (
        <Boton
            variante="acento"
            tamano="lg"
            icono={ShoppingCart}
            anchoCompleto
            disabled={agotado}
            cargando={compra.agregando}
            onClick={compra.agregarAlCarrito}
        >
            {agotado ? 'Agotado' : 'Agregar al carrito'}
        </Boton>
    );

    return (
        <>
            <div className="row g-4 g-lg-5">
                <div className="col-lg-7">
                    <div className={estilos.galeria}>
                        {imagenes.length > 1 && (
                            <div className={estilos.miniaturas}>
                                {imagenes.map((i) => (
                                    <button
                                        key={i.rutaImagen}
                                        type="button"
                                        aria-label={`Ver imagen: ${i.textoAlternativo}`}
                                        aria-pressed={i === imagen}
                                        className={i === imagen ? estilos.miniaturaActiva : undefined}
                                        onClick={() => {
                                            compra.elegirImagen(i.rutaImagen);
                                        }}
                                    >
                                        <ImagenProducto ruta={i.rutaImagen} texto="" />
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className={estilos.imagenPrincipal}>
                            <ImagenProducto
                                ruta={imagen?.rutaImagen ?? null}
                                texto={imagen?.textoAlternativo ?? producto.nombre}
                                prioridad
                            />
                        </div>
                    </div>
                </div>
                <div className="col-lg-5">
                    <div className={estilos.compra}>
                        <p className={estilos.codigo}>
                            {producto.categoria}
                            {variante && ` · Código ${variante.sku}`}
                        </p>
                        <h1>{producto.nombre}</h1>
                        {variante && <p className={`${estilos.precioDetalle} numero`}>{moneda(variante.precio)}</p>}
                        <p className={estilos.notaPrecio}>Precio incluye IVA</p>
                        <div className={estilos.existencia}>
                            {agotado && (
                                <span
                                    className={`badge rounded-pill ${estilos.avisoExistencia} ${estilos.sinExistencia}`}
                                >
                                    <PackageX size={16} aria-hidden="true" />
                                    Agotado
                                </span>
                            )}
                            {pocasUnidades && (
                                <span
                                    className={`badge rounded-pill ${estilos.avisoExistencia} ${estilos.pocaExistencia}`}
                                >
                                    <TriangleAlert size={16} aria-hidden="true" />
                                    Solo {disponible} {disponible === 1 ? 'disponible' : 'disponibles'}
                                </span>
                            )}
                        </div>
                        {grupos.map((grupo) => {
                            const elegido = variante?.atributos.find((a) => a.idAtributo === grupo.idAtributo);
                            return (
                                <fieldset key={grupo.idAtributo} className={estilos.atributo}>
                                    <legend>
                                        {grupo.atributo}: {elegido?.valor}
                                    </legend>
                                    <div className={estilos.valores}>
                                        {grupo.valores.map((v) => (
                                            <button
                                                key={v.idAtributoValor}
                                                type="button"
                                                aria-pressed={v.idAtributoValor === elegido?.idAtributoValor}
                                                className={`${estilos.valor} ${v.conExistencia ? '' : estilos.valorAgotado}`}
                                                onClick={() => {
                                                    compra.elegirValor(grupo.idAtributo, v.idAtributoValor);
                                                }}
                                            >
                                                {v.codigoHex && (
                                                    <span
                                                        className={estilos.muestra}
                                                        style={{ backgroundColor: v.codigoHex }}
                                                        aria-hidden="true"
                                                    />
                                                )}
                                                {v.valor}
                                                {!v.conExistencia && (
                                                    <span className="visually-hidden"> (agotado)</span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </fieldset>
                            );
                        })}
                        <div className={estilos.comprar}>
                            <Cantidad
                                valor={cantidad}
                                alCambiar={compra.setCantidad}
                                maximo={disponible}
                                disabled={agotado}
                            />
                            <div className={estilos.comprarBoton}>{botonAgregar}</div>
                        </div>
                        <MetodosEnvio />
                    </div>
                </div>
            </div>
            {producto.descripcion && (
                <section className={estilos.descripcion}>
                    <h2>Descripción</h2>
                    <p>{producto.descripcion}</p>
                </section>
            )}
            <FilaProductos
                titulo={`Más de ${producto.categoria}`}
                filtros={{ categoria: producto.slugCategoria }}
                verTodo={`/productos?categoria=${producto.slugCategoria}`}
                excluir={producto.idProducto}
            />
            <div className={estilos.barraCompra}>
                {variante && (
                    <div>
                        <small>Precio</small>
                        <strong className="numero">{moneda(variante.precio)}</strong>
                    </div>
                )}
                {botonAgregar}
            </div>
        </>
    );
}

function EsqueletoDetalle() {
    return (
        <div className="row g-4 g-lg-5" role="status" aria-label="Cargando producto">
            <div className="col-lg-7">
                <div className={estilos.imagenPrincipal}>
                    <Esqueleto alto="100%" radio="12px" />
                </div>
            </div>
            <div className="col-lg-5">
                <Esqueleto ancho="40%" alto="0.875rem" />
                <Esqueleto alto="2.25rem" style={{ marginTop: '0.75rem' }} />
                <Esqueleto ancho="35%" alto="2.5rem" style={{ marginTop: '0.75rem' }} />
                <Esqueleto ancho="60%" alto="2.75rem" style={{ marginTop: '1.5rem' }} />
                <Esqueleto alto="3.25rem" style={{ marginTop: '1.5rem' }} />
            </div>
        </div>
    );
}

export default function DetalleProducto() {
    const { slug = '' } = useParams();
    const consulta = useDetalleProducto(slug);
    const producto = consulta.data?.data;
    const noExiste = esErrorApi(consulta.error) && consulta.error.estado === 404;

    return (
        <div className={estilos.paginaDetalle}>
            <title>{`${producto?.nombre ?? 'Producto'} · ShopCart`}</title>
            <MigaPan
                rutas={[
                    { etiqueta: 'Inicio', a: '/' },
                    ...(producto
                        ? [
                              { etiqueta: producto.categoria, a: `/productos?categoria=${producto.slugCategoria}` },
                              { etiqueta: producto.nombre },
                          ]
                        : [{ etiqueta: 'Producto' }]),
                ]}
            />
            {consulta.isPending && <EsqueletoDetalle />}
            {noExiste && (
                <EstadoVacio
                    nivel={1}
                    icono={PackageX}
                    titulo="Este producto ya no está disponible"
                    accion={
                        <BotonEnlace to="/productos" tamano="sm">
                            Explorar productos
                        </BotonEnlace>
                    }
                />
            )}
            {consulta.isError && !noExiste && (
                <EstadoError
                    titulo="No pudimos cargar el producto"
                    mensaje={consulta.error.message}
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {/* key: al pasar a otro producto desde "Más de…", la selección empieza de nuevo. */}
            {producto && <Contenido key={producto.idProducto} producto={producto} />}
        </div>
    );
}
