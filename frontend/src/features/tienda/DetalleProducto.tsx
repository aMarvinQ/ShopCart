import { useQuery } from '@tanstack/react-query';
import { PackageX, ShoppingCart, TriangleAlert, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../../api/cliente';
import { esErrorApi } from '../../api/errores';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { Cantidad } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { MigaPan } from '../../ui/Navegacion';
import { moneda } from '../../utils/formato';
import { useAgregarAlCarrito } from '../carrito/consultas';
import { consultaDetalle, type DetalleDeProducto } from './consultas';
import { FilaProductos } from './FilaProductos';
import { ImagenProducto } from './TarjetaProducto';
import { gruposDeAtributos, imagenesDeVariante, varianteAlElegir } from './variantes';
import estilos from './tienda.module.scss';

const POCAS_UNIDADES = 5;

function plazo(minimo: number, maximo: number): string {
    const dias = `${String(maximo)} ${maximo === 1 ? 'día' : 'días'}`;
    if (minimo === 0) return `Hasta ${dias}`;
    return minimo === maximo ? dias : `De ${String(minimo)} a ${dias}`;
}

function MetodosEnvio() {
    const { data } = useQuery({
        queryKey: ['tienda', 'metodos-envio'],
        queryFn: ({ signal }) => api.get('/tienda/metodos-envio', { signal }),
        staleTime: 5 * 60_000,
    });
    if (!data || data.data.length === 0) return null;
    return (
        <ul className={estilos.metodos}>
            {data.data.map((m) => (
                <li key={m.idMetodoEnvio}>
                    <Truck size={20} aria-hidden="true" />
                    <div>
                        <strong>{m.nombre}</strong>
                        <p>
                            {plazo(m.diasEstimadosMin, m.diasEstimadosMax)} ·{' '}
                            {m.costo === 0 ? 'sin costo' : moneda(m.costo)}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function Contenido({ producto }: { producto: DetalleDeProducto }) {
    const { variantes } = producto;
    const inicial = variantes.find((v) => v.esSeleccionInicial) ?? variantes[0];
    const [idVariante, setIdVariante] = useState(inicial?.idVariante);
    const [cantidad, setCantidad] = useState(1);
    const [imagenElegida, setImagenElegida] = useState<string | null>(null);
    const { agregar, agregando } = useAgregarAlCarrito();

    const variante = variantes.find((v) => v.idVariante === idVariante) ?? inicial;
    const grupos = useMemo(() => (variante ? gruposDeAtributos(variantes, variante) : []), [variantes, variante]);
    const imagenes = useMemo(() => imagenesDeVariante(producto.imagenes, variante), [producto.imagenes, variante]);
    const imagen = imagenes.find((i) => i.rutaImagen === imagenElegida) ?? imagenes[0];

    const disponible = variante?.disponible ?? 0;
    const agotado = disponible === 0;

    const elegir = (idAtributo: number, idValor: number) => {
        if (!variante) return;
        setIdVariante(varianteAlElegir(variantes, variante, idAtributo, idValor).idVariante);
        setCantidad(1);
        setImagenElegida(null);
    };
    const alAgregar = () => {
        if (!variante) return;
        const detalle = variante.atributos.map((a) => a.valor).join(' / ');
        void agregar({
            idVariante: variante.idVariante,
            cantidad,
            nombre: detalle ? `${producto.nombre} · ${detalle}` : producto.nombre,
        });
    };
    const botonAgregar = (
        <Boton
            variante="acento"
            tamano="lg"
            icono={ShoppingCart}
            anchoCompleto
            disabled={agotado}
            cargando={agregando}
            onClick={alAgregar}
        >
            {agotado ? 'Agotado' : 'Agregar al carrito'}
        </Boton>
    );

    return (
        <>
            <div className={estilos.detalle}>
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
                                        setImagenElegida(i.rutaImagen);
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
                <div className={estilos.compra}>
                    <p className={estilos.codigo}>
                        {producto.categoria}
                        {variante && ` · Código ${variante.sku}`}
                    </p>
                    <h1>{producto.nombre}</h1>
                    {variante && <p className={`${estilos.precioDetalle} numero`}>{moneda(variante.precio)}</p>}
                    <p className={estilos.notaPrecio}>Precio incluye IVA</p>
                    {!agotado && disponible <= POCAS_UNIDADES && (
                        <p className={estilos.quedan}>
                            <TriangleAlert size={16} aria-hidden="true" />
                            Quedan {disponible} en existencia
                        </p>
                    )}
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
                                                elegir(grupo.idAtributo, v.idAtributoValor);
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
                                            {!v.conExistencia && <span className="visually-hidden"> (agotado)</span>}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        );
                    })}
                    <div className={estilos.comprar}>
                        <Cantidad valor={cantidad} alCambiar={setCantidad} maximo={disponible} disabled={agotado} />
                        <div className={estilos.comprarBoton}>{botonAgregar}</div>
                    </div>
                    <MetodosEnvio />
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
                        <small>Total</small>
                        <strong className="numero">{moneda(variante.precio * cantidad)}</strong>
                    </div>
                )}
                {botonAgregar}
            </div>
        </>
    );
}

function EsqueletoDetalle() {
    return (
        <div className={estilos.detalle} role="status" aria-label="Cargando producto">
            <div className={estilos.galeria}>
                <div className={estilos.imagenPrincipal}>
                    <Esqueleto alto="100%" radio="12px" />
                </div>
            </div>
            <div className={estilos.compra}>
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
    const consulta = useQuery(consultaDetalle(slug));
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
