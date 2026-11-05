import { ArrowRight, Info, ShoppingCart, TicketPercent, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../api/cliente';
import { esErrorApi } from '../../api/errores';
import { useSesion } from '../../sesion/contexto';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Cantidad } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { useAvisos } from '../../ui/avisos/contexto';
import { moneda } from '../../utils/formato';
import { ImagenProducto } from '../tienda/TarjetaProducto';
import { useCambioCarrito, useCarrito, type Carrito as DatosCarrito, type LineaCarrito } from './consultas';
import estilos from './carrito.module.scss';

function avisoDeLinea({ estado, cantidadMaxima }: LineaCarrito): string | null {
    if (estado === 'AGOTADO') return 'Se agotó. Quítalo para continuar.';
    if (estado === 'NO_DISPONIBLE') return 'Ya no está a la venta. Quítalo para continuar.';
    if (estado === 'CANTIDAD_EXCEDIDA') return `Solo puedes llevar ${String(cantidadMaxima)}. Ajusta la cantidad.`;
    return null;
}

function Linea({ linea }: { linea: LineaCarrito }) {
    const avisar = useAvisos();
    const alFallar = (error: unknown) => {
        avisar({
            tipo: 'error',
            titulo: 'No se pudo actualizar',
            detalle: error instanceof Error ? error.message : 'Intenta de nuevo.',
        });
    };
    const params = { idVariante: linea.idVariante };
    const cambiarCantidad = useCambioCarrito((cantidad: number) =>
        api.put('/carrito/items/{idVariante}', { params, cuerpo: { cantidad } }),
    );
    const quitar = useCambioCarrito<undefined>(() => api.delete('/carrito/items/{idVariante}', { params }));
    const ocupada = cambiarCantidad.isPending || quitar.isPending;
    const aviso = avisoDeLinea(linea);

    return (
        <li className={estilos.linea}>
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
                    {cambiarCantidad.isPending ? (
                        <Esqueleto ancho="5.5rem" alto="1.25rem" />
                    ) : (
                        <strong className="numero">{moneda(linea.importe)}</strong>
                    )}
                    {linea.cantidad > 1 ? (<small className="numero">{moneda(linea.precioUnitario)} c/u</small>) : null}
                </div>
                <div className={estilos.lineaAcciones}>
                    <Boton
                        variante="fantasma"
                        icono={Trash2}
                        aria-label={`Quitar ${linea.producto}`}
                        className={estilos.quitar ?? ''}
                        cargando={quitar.isPending}
                        disabled={cambiarCantidad.isPending}
                        onClick={() => {
                            quitar.mutate(undefined, { onError: alFallar });
                        }}
                    />
                    <Cantidad
                        etiqueta={`Cantidad de ${linea.producto}`}
                        valor={linea.cantidad}
                        minimo={1}
                        maximo={Math.max(linea.cantidadMaxima, linea.cantidad)}
                        disabled={ocupada}
                        alCambiar={(cantidad) => {
                            cambiarCantidad.mutate(cantidad, { onError: alFallar });
                        }}
                    />
                </div>
            </div>
        </li>
    );
}

function mensajeDeCupon({ cupon }: DatosCarrito): string | null {
    if (!cupon || cupon.aplicable) return null;
    if (cupon.codigoError === 'CUPON_MONTO_MINIMO' && cupon.montoFaltante !== null) {
        return `Faltan ${moneda(cupon.montoFaltante)} para usar este cupón.`;
    }
    return 'Este cupón no aplica a tu carrito. Quítalo para continuar.';
}

function Cupon({ carrito }: { carrito: DatosCarrito }) {
    const [codigo, setCodigo] = useState('');
    const [error, setError] = useState<string | undefined>();
    const aplicar = useCambioCarrito((valor: string) => api.post('/carrito/cupon', { cuerpo: { codigo: valor } }));
    const quitar = useCambioCarrito<undefined>(() => api.delete('/carrito/cupon'));
    const noAplica = mensajeDeCupon(carrito);

    const enviar = () => {
        const valor = codigo.trim();
        if (valor.length < 3) {
            setError('Escribe el código del cupón.');
            return;
        }
        setError(undefined);
        aplicar.mutate(valor, {
            onSuccess: () => {
                setCodigo('');
            },
            onError: (e) => {
                setError(e.message);
            },
        });
    };

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
                            disabled={quitar.isPending}
                            onClick={() => {
                                quitar.mutate(undefined);
                            }}
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
                enviar();
            }}
        >
            <Campo
                etiqueta="Cupón de descuento"
                placeholder="Escribe tu código"
                maxLength={30}
                autoComplete="off"
                value={codigo}
                error={error}
                onChange={({ target }) => {
                    setCodigo(target.value);
                }}
            />
            <Boton type="submit" variante="secundario" cargando={aplicar.isPending}>
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
            <div className={estilos.continuarEscritorio}>
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
        <div className={estilos.carrito} role="status" aria-label="Cargando carrito">
            <div>
                <Esqueleto ancho="12rem" alto="2rem" style={{ marginBottom: '1rem' }} />
                <Tarjeta>
                    {Array.from({ length: 3 }, (_, i) => (
                        <div key={i} className={estilos.linea}>
                            <div className={estilos.lineaImagen}>
                                <Esqueleto alto="100%" />
                            </div>
                            <div className={estilos.lineaDatos}>
                                <Esqueleto ancho="70%" />
                            </div>
                            <div className={estilos.lineaControles}>
                                <Esqueleto ancho="9rem" alto="2.75rem" />
                            </div>
                        </div>
                    ))}
                </Tarjeta>
            </div>
            <Tarjeta className={estilos.resumen}>
                <Esqueleto alto="20rem" />
            </Tarjeta>
        </div>
    );
}

export default function Carrito() {
    const { usuario } = useSesion();
    const consulta = useCarrito();
    const [confirmarVaciar, setConfirmarVaciar] = useState(false);
    const vaciar = useCambioCarrito<undefined>(() => api.delete('/carrito'));
    const carrito = consulta.data?.data;

    if (usuario && usuario.codigoRol !== 'CLIENTE') {
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
                <div className={estilos.carrito}>
                    <section>
                        <div className={estilos.cabecera}>
                            <h1>
                                Tu carrito{' '}
                                <small>
                                    ({carrito.cantidadArticulos}{' '}
                                    {carrito.cantidadArticulos === 1 ? 'producto' : 'productos'})
                                </small>
                            </h1>
                            <Boton
                                variante="enlace"
                                tamano="sm"
                                onClick={() => {
                                    setConfirmarVaciar(true);
                                }}
                            >
                                Vaciar carrito
                            </Boton>
                        </div>
                        <Tarjeta>
                            <ul className={estilos.lineas}>
                                {carrito.items.map((linea) => (
                                    <Linea key={linea.idVariante} linea={linea} />
                                ))}
                            </ul>
                        </Tarjeta>
                        {!usuario && (
                            <p className={estilos.nota}>
                                <Info size={18} aria-hidden="true" />
                                Puedes comprar como invitado; no necesitas crear una cuenta.
                            </p>
                        )}
                    </section>
                    <Tarjeta className={estilos.resumen}>
                        <Resumen carrito={carrito} />
                    </Tarjeta>
                    <div className={estilos.barraPago}>
                        <div className={estilos.barraPagoTotal}>
                            <span>Total con IVA</span>
                            <strong className="numero">{moneda(carrito.total)}</strong>
                        </div>
                        <BotonContinuar carrito={carrito} />
                    </div>
                </div>
            )}
            <DialogoConfirmacion
                mostrar={confirmarVaciar}
                titulo="¿Vaciar el carrito?"
                textoConfirmar="Sí, vaciar"
                cargando={vaciar.isPending}
                alCancelar={() => {
                    setConfirmarVaciar(false);
                }}
                alConfirmar={() => {
                    vaciar.mutate(undefined, {
                        onSettled: () => {
                            setConfirmarVaciar(false);
                        },
                    });
                }}
            >
                Se quitarán todos los productos.
            </DialogoConfirmacion>
        </>
    );
}
