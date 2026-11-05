import { ArrowRight, Info, ShoppingCart, TicketPercent, Trash2, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { esErrorApi } from '../../api/errores';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Cantidad } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { moneda } from '../../utils/formato';
import { ImagenProducto } from '../tienda/TarjetaProducto';
import {
    useCarrito,
    useCuponCarrito,
    useLineaCarrito,
    useVaciarCarrito,
    type Carrito as DatosCarrito,
    type LineaCarrito,
} from './hooks/useCarrito';
import { avisoDeCupon, avisoDeLinea } from './mensajes';
import estilos from './carrito.module.scss';

function Linea({ linea }: { linea: LineaCarrito }) {
    const { recalculando, quitando, cambiarCantidad, quitar } = useLineaCarrito(linea.idVariante);
    const aviso = avisoDeLinea(linea);

    return (
        <li className={`list-group-item ${estilos.linea}`}>
            <Link to={`/productos/${linea.slug}`} className={estilos.lineaImagen} tabIndex={-1} aria-hidden="true">
                <ImagenProducto ruta={linea.imagen} texto="" />
            </Link>
            <div className={estilos.lineaDatos}>
                <Link to={`/productos/${linea.slug}`} className={estilos.lineaNombre}>
                    {linea.producto}
                </Link>
                {linea.descripcion && <p className={estilos.lineaDetalle}>{linea.descripcion}</p>}
                {aviso && <p className={estilos.lineaAviso}>{aviso}</p>}
            </div>
            <div className={estilos.lineaControles}>
                <div className={estilos.lineaImporte}>
                    {/* Mientras se recalcula, el espacio queda reservado: nada se mueve. */}
                    {recalculando ? (
                        <Esqueleto ancho="5.5rem" alto="1.25rem" />
                    ) : (
                        <strong className="numero">{moneda(linea.importe)}</strong>
                    )}
                    {linea.cantidad > 1 ? <small className="numero">{moneda(linea.precioUnitario)} c/u</small> : ''}
                </div>
                <div className={estilos.lineaAcciones}>
                    <Boton
                        variante="fantasma"
                        icono={Trash2}
                        aria-label={`Quitar ${linea.producto}`}
                        className={estilos.quitar ?? ''}
                        cargando={quitando}
                        disabled={recalculando}
                        onClick={quitar}
                    />
                    <Cantidad
                        etiqueta={`Cantidad de ${linea.producto}`}
                        valor={linea.cantidad}
                        minimo={1}
                        maximo={Math.max(linea.cantidadMaxima, linea.cantidad)}
                        disabled={recalculando || quitando}
                        alCambiar={cambiarCantidad}
                    />
                </div>
            </div>
        </li>
    );
}

function Cupon({ carrito }: { carrito: DatosCarrito }) {
    const cupon = useCuponCarrito();
    const noAplica = avisoDeCupon(carrito);

    if (carrito.cupon) {
        return (
            <div className={estilos.cupon}>
                <div className={estilos.cuponAplicado}>
                    <span className={estilos.cuponChip}>
                        <TicketPercent size={16} aria-hidden="true" />
                        {carrito.cupon.codigo}
                        <button
                            type="button"
                            aria-label={`Quitar cupón ${carrito.cupon.codigo}`}
                            disabled={cupon.quitando}
                            onClick={cupon.quitar}
                        >
                            <X size={16} aria-hidden="true" />
                        </button>
                    </span>
                    <small>{carrito.cupon.descripcion}</small>
                </div>
                {noAplica && <Alerta tipo="aviso">{noAplica}</Alerta>}
            </div>
        );
    }

    return (
        <form
            className={estilos.cuponFormulario}
            noValidate
            onSubmit={(evento) => {
                evento.preventDefault();
                cupon.aplicar();
            }}
        >
            <Campo
                etiqueta="Cupón de descuento"
                placeholder="Escribe tu código"
                maxLength={30}
                autoComplete="off"
                value={cupon.codigo}
                error={cupon.error}
                onChange={({ target }) => {
                    cupon.setCodigo(target.value);
                }}
            />
            <Boton type="submit" variante="secundario" cargando={cupon.aplicando}>
                Aplicar
            </Boton>
        </form>
    );
}

function BotonContinuar({ carrito }: { carrito: DatosCarrito }) {
    const navegar = useNavigate();
    return (
        <Boton
            variante="acento"
            tamano="lg"
            anchoCompleto
            iconoDerecha={ArrowRight}
            disabled={!carrito.puedeComprar}
            onClick={() => void navegar('/checkout')}
        >
            Continuar al pago
        </Boton>
    );
}

function Resumen({ carrito }: { carrito: DatosCarrito }) {
    return (
        <>
            <h2 className={estilos.resumenTitulo}>Resumen</h2>
            <Cupon carrito={carrito} />
            <dl className={estilos.importes}>
                <div>
                    <dt>Subtotal</dt>
                    <dd className="numero">{moneda(carrito.subtotal)}</dd>
                </div>
                {carrito.descuento > 0 && (
                    <div className={estilos.descuento}>
                        <dt>Descuento cupón</dt>
                        <dd className="numero">−{moneda(carrito.descuento)}</dd>
                    </div>
                )}
                <div>
                    <dt>Envío</dt>
                    <dd>Se calcula al pagar</dd>
                </div>
                <div className={estilos.total}>
                    <dt>Total</dt>
                    <dd className="numero">{moneda(carrito.total)}</dd>
                </div>
            </dl>
            <p className={estilos.notaIva}>Los precios incluyen IVA</p>
            <div className="d-none d-lg-block">
                <BotonContinuar carrito={carrito} />
            </div>
            {!carrito.puedeComprar && (
                <p className={estilos.notaIva}>Revisa los avisos de tu carrito para continuar.</p>
            )}
            <BotonEnlace to="/" variante="secundario" anchoCompleto>
                Seguir comprando
            </BotonEnlace>
        </>
    );
}

function EsqueletoCarrito() {
    return (
        <div className="row g-4" role="status" aria-label="Cargando carrito">
            <div className="col-lg-8">
                <Esqueleto ancho="12rem" alto="2rem" style={{ marginBottom: '1rem' }} />
                <Tarjeta>
                    <ul className="list-group list-group-flush">
                        {Array.from({ length: 3 }, (_, i) => (
                            <li key={i} className={`list-group-item ${estilos.linea}`}>
                                <div className={estilos.lineaImagen}>
                                    <Esqueleto alto="100%" />
                                </div>
                                <div className={estilos.lineaDatos}>
                                    <Esqueleto ancho="70%" />
                                </div>
                                <div className={estilos.lineaControles}>
                                    <Esqueleto ancho="9rem" alto="2.75rem" />
                                </div>
                            </li>
                        ))}
                    </ul>
                </Tarjeta>
            </div>
            <div className="col-lg-4">
                <Tarjeta className={estilos.resumen}>
                    <Esqueleto alto="20rem" />
                </Tarjeta>
            </div>
        </div>
    );
}

export default function Carrito() {
    const consulta = useCarrito();
    const vaciar = useVaciarCarrito();
    const carrito = consulta.data?.data;

    if (consulta.esPersonal) {
        return (
            <>
                <title>Carrito · ShopCart</title>
                <EstadoVacio
                    nivel={1}
                    icono={ShoppingCart}
                    titulo="El personal de la tienda no compra"
                    mensaje="Para comprar, ingresa con una cuenta de cliente."
                />
            </>
        );
    }

    return (
        <>
            <title>Carrito · ShopCart</title>
            {consulta.isPending && <EsqueletoCarrito />}
            {consulta.isError && (
                <EstadoError
                    titulo="No pudimos cargar tu carrito"
                    mensaje={consulta.error.message}
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {carrito?.items.length === 0 && (
                <EstadoVacio
                    nivel={1}
                    icono={ShoppingCart}
                    titulo="Tu carrito está vacío"
                    mensaje="Agrega productos y aquí verás el total."
                    accion={<BotonEnlace to="/productos">Explorar productos</BotonEnlace>}
                />
            )}
            {carrito && carrito.items.length > 0 && (
                <div className="row g-4">
                    <section className="col-lg-8">
                        <div className={estilos.cabecera}>
                            <h1>
                                Tu carrito{' '}
                                <small>
                                    ({carrito.cantidadArticulos}{' '}
                                    {carrito.cantidadArticulos === 1 ? 'producto' : 'productos'})
                                </small>
                            </h1>
                            <Boton variante="enlace" tamano="sm" onClick={vaciar.pedirConfirmacion}>
                                Vaciar carrito
                            </Boton>
                        </div>
                        <Tarjeta>
                            <ul className="list-group list-group-flush">
                                {carrito.items.map((linea) => (
                                    <Linea key={linea.idVariante} linea={linea} />
                                ))}
                            </ul>
                        </Tarjeta>
                        {consulta.esInvitado && (
                            <p className={estilos.nota}>
                                <Info size={18} aria-hidden="true" />
                                Puedes comprar como invitado; no necesitas crear una cuenta.
                            </p>
                        )}
                    </section>
                    <div className="col-lg-4">
                        <Tarjeta className={estilos.resumen}>
                            <Resumen carrito={carrito} />
                        </Tarjeta>
                    </div>
                    <div className={`col-12 d-lg-none ${estilos.barraPago}`}>
                        <div className={estilos.barraPagoTotal}>
                            <span>Total con IVA</span>
                            <strong className="numero">{moneda(carrito.total)}</strong>
                        </div>
                        <BotonContinuar carrito={carrito} />
                    </div>
                </div>
            )}
            <DialogoConfirmacion
                mostrar={vaciar.confirmando}
                titulo="¿Vaciar el carrito?"
                textoConfirmar="Sí, vaciar"
                cargando={vaciar.vaciando}
                alCancelar={vaciar.cancelar}
                alConfirmar={vaciar.confirmar}
            >
                Se quitarán todos los productos.
            </DialogoConfirmacion>
        </>
    );
}
