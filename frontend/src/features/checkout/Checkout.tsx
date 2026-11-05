import { ArrowRight, Clock, Lock, Plus, ShoppingCart } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { FormProvider } from 'react-hook-form';
import { esErrorApi } from '../../api/errores';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Radio } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, Cajon, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { Selector } from '../../ui/Selector';
import { minutosYSegundos, moneda } from '../../utils/formato';
import { CamposDestinatario, CamposUbicacion } from '../cuenta/CamposDireccion';
import { FormularioDireccion } from '../cuenta/FormularioDireccion';
import { textoPlazo } from '../tienda/textos';
import {
    formatearNumeroTarjeta,
    formatearVencimiento,
    useCuentaRegresiva,
    useEntrega,
    usePago,
    useReserva,
    type DatosCheckout,
} from './hooks/useCheckout';
import { ResumenCarrito, ResumenReserva } from './ResumenCompra';
import estilos from './checkout.module.scss';

function Seccion({
    numero,
    titulo,
    accion,
    children,
}: {
    numero: number;
    titulo: string;
    accion?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Tarjeta className={estilos.seccion}>
            <div className={estilos.seccionCabecera}>
                <span className={`badge rounded-circle ${estilos.seccionNumero}`}>{numero}</span>
                <h2>{titulo}</h2>
                {accion && <div className="ms-auto">{accion}</div>}
            </div>
            {children}
        </Tarjeta>
    );
}

type Entrega = ReturnType<typeof useEntrega>;

function DireccionCliente({ entrega }: { entrega: Entrega }) {
    const [agregando, setAgregando] = useState(false);
    return (
        <>
            <div className={estilos.direccionCliente}>
                <div className="flex-grow-1">
                    <Selector
                        etiqueta="Dirección de entrega"
                        marcador="Elige una dirección"
                        valor={entrega.idDireccion === undefined ? null : String(entrega.idDireccion)}
                        error={entrega.errorDireccion}
                        opciones={entrega.direcciones.map((d) => ({
                            valor: String(d.idDireccion),
                            etiqueta: d.alias,
                            detalle: `${d.linea1}, ${d.municipio}, ${d.departamento}`,
                        }))}
                        alCambiar={(valor) => {
                            entrega.elegirDireccion(Number(valor));
                        }}
                    />
                </div>
                <Boton
                    variante="secundario"
                    icono={Plus}
                    className={estilos.agregarDireccion ?? ''}
                    onClick={() => {
                        setAgregando(true);
                    }}
                >
                    Agregar dirección
                </Boton>
            </div>
            <Cajon
                mostrar={agregando}
                titulo="Agregar dirección"
                alCerrar={() => {
                    setAgregando(false);
                }}
            >
                {agregando && (
                    <FormularioDireccion
                        direccion={null}
                        alGuardar={(idNueva) => {
                            if (idNueva !== undefined) entrega.elegirDireccion(idNueva);
                            setAgregando(false);
                        }}
                    />
                )}
            </Cajon>
        </>
    );
}

function MetodosEnvio({ entrega }: { entrega: Entrega }) {
    return (
        <fieldset className={estilos.metodos}>
            <legend className="visually-hidden">Método de envío</legend>
            <div className="row g-3">
                {entrega.metodos.map((m) => {
                    const elegido = entrega.idMetodo === m.idMetodoEnvio;
                    return (
                        <div key={m.idMetodoEnvio} className="col-md-6">
                            <div className={`${estilos.metodo} ${elegido ? estilos.metodoElegido : ''}`}>
                                <Radio
                                    name="metodo"
                                    etiqueta={m.nombre}
                                    checked={elegido}
                                    onChange={() => {
                                        entrega.elegirMetodo(m.idMetodoEnvio);
                                    }}
                                />
                                <p>
                                    {textoPlazo(m.diasEstimadosMin, m.diasEstimadosMax)} ·{' '}
                                    <strong>{m.costo === 0 ? 'Sin costo' : moneda(m.costo)}</strong>
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </fieldset>
    );
}

function PasoEntrega({ entrega }: { entrega: Entrega }) {
    const {
        register,
        formState: { errors },
    } = entrega.formulario;

    return (
        <form
            noValidate
            className={estilos.pasos}
            onSubmit={(evento) => {
                evento.preventDefault();
                void entrega.continuar();
            }}
        >
            {entrega.errorGeneral && <Alerta tipo="error">{entrega.errorGeneral}</Alerta>}
            {entrega.esInvitado ? (
                <FormProvider {...entrega.formulario}>
                    <Seccion numero={1} titulo="Contacto">
                        <Campo
                            etiqueta="Correo electrónico"
                            type="email"
                            autoComplete="email"
                            ayuda="Identifica tu pedido; lo necesitamos para cualquier aclaración."
                            error={errors.correo?.message}
                            {...register('correo')}
                        />
                        <CamposDestinatario />
                    </Seccion>
                    <Seccion numero={2} titulo="Entrega">
                        <MetodosEnvio entrega={entrega} />
                        <CamposUbicacion />
                    </Seccion>
                </FormProvider>
            ) : (
                <Seccion numero={1} titulo="Entrega">
                    <MetodosEnvio entrega={entrega} />
                    <DireccionCliente entrega={entrega} />
                </Seccion>
            )}
            <Boton
                type="submit"
                variante="acento"
                tamano="lg"
                anchoCompleto
                iconoDerecha={ArrowRight}
                cargando={entrega.reservando}
            >
                Continuar al pago
            </Boton>
        </form>
    );
}

function PasoPago({ checkout, recargar, numero }: { checkout: DatosCheckout; recargar: () => void; numero: number }) {
    const { formulario, rechazo, pagando, enviar } = usePago(checkout, recargar);
    const {
        register,
        formState: { errors },
    } = formulario;
    const numeroTarjeta = register('tarjeta.numero');
    const vencimiento = register('tarjeta.vencimiento');

    return (
        <form noValidate className={estilos.pasos} onSubmit={(e) => void enviar(e)}>
            {rechazo && (
                <Alerta tipo="error" titulo="No se realizó el cobro">
                    {rechazo.mensaje}
                    {rechazo.referencia && <small className="d-block numero">Ref.: {rechazo.referencia}</small>}
                </Alerta>
            )}
            <Seccion numero={numero} titulo="Pago">
                <Campo
                    etiqueta="Número de tarjeta"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="0000 0000 0000 0000"
                    error={errors.tarjeta?.numero?.message}
                    {...numeroTarjeta}
                    onChange={(evento) => {
                        evento.target.value = formatearNumeroTarjeta(evento.target.value);
                        void numeroTarjeta.onChange(evento);
                    }}
                />
                <Campo
                    etiqueta="Nombre en la tarjeta"
                    autoComplete="cc-name"
                    error={errors.tarjeta?.titular?.message}
                    {...register('tarjeta.titular')}
                />
                <div className="row gx-3">
                    <div className="col-6">
                        <Campo
                            etiqueta="Vencimiento"
                            inputMode="numeric"
                            autoComplete="cc-exp"
                            placeholder="MM/AA"
                            error={errors.tarjeta?.vencimiento?.message}
                            {...vencimiento}
                            onChange={(evento) => {
                                evento.target.value = formatearVencimiento(evento.target.value);
                                void vencimiento.onChange(evento);
                            }}
                        />
                    </div>
                    <div className="col-6">
                        <Campo
                            etiqueta="Código de seguridad"
                            inputMode="numeric"
                            autoComplete="cc-csc"
                            maxLength={4}
                            placeholder="3 dígitos"
                            ayuda="Al reverso de la tarjeta."
                            error={errors.tarjeta?.cvv?.message}
                            {...register('tarjeta.cvv')}
                        />
                    </div>
                </div>
            </Seccion>
            <Boton type="submit" variante="acento" tamano="lg" anchoCompleto icono={Lock} cargando={pagando}>
                Pagar {moneda(checkout.total)}
            </Boton>
        </form>
    );
}

function DatosReservados({ checkout, alCambiar }: { checkout: DatosCheckout; alCambiar: () => void }) {
    return (
        <Seccion
            numero={1}
            titulo="Entrega"
            accion={
                <Boton variante="enlace" tamano="sm" onClick={alCambiar}>
                    Cambiar
                </Boton>
            }
        >
            <address className={estilos.reservado}>
                <strong>{checkout.envioNombre}</strong> · {checkout.envioTelefono}
                <br />
                {checkout.envioLinea1}
                {checkout.envioLinea2 && `, ${checkout.envioLinea2}`}
                <br />
                {checkout.envioMunicipio}, {checkout.departamento}
                <br />
                {checkout.correoContacto}
            </address>
            <p className={estilos.reservado}>
                <strong>{checkout.metodoEnvio}</strong> ·{' '}
                {textoPlazo(checkout.diasEstimadosMin, checkout.diasEstimadosMax)}
            </p>
        </Seccion>
    );
}

function CuentaRegresiva({
    segundos,
    recibidoEn,
    alTerminar,
}: {
    segundos: number;
    recibidoEn: number;
    alTerminar: () => void;
}) {
    const restantes = useCuentaRegresiva(segundos, recibidoEn, alTerminar);
    return (
        <p className={estilos.cuenta} role="timer">
            <Clock size={18} aria-hidden="true" />
            Reservamos tus productos por <strong className="numero">{minutosYSegundos(restantes)}</strong>
        </p>
    );
}

function Reserva({ idCheckout, alCambiar }: { idCheckout: string; alCambiar: () => void }) {
    const consulta = useReserva(idCheckout);
    const checkout = consulta.data?.data;
    const recargar = () => void consulta.refetch();

    if (consulta.isPending) return <EsqueletoCheckout />;
    if (consulta.isError) {
        return (
            <EstadoError
                titulo="No pudimos cargar tu reserva"
                mensaje={consulta.error.message}
                referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                alReintentar={recargar}
            />
        );
    }
    if (!checkout) return null;
    if (checkout.estado !== 'PENDIENTE') {
        return (
            <EstadoVacio
                nivel={1}
                icono={Clock}
                titulo={
                    checkout.estado === 'CARRITO_MODIFICADO' ? 'Tu carrito cambió' : 'Tu reserva ya no está vigente'
                }
                mensaje="Los productos se liberaron y no se hizo ningún cobro. Revisa tu carrito para continuar."
                accion={<BotonEnlace to="/carrito">Volver al carrito</BotonEnlace>}
            />
        );
    }
    return (
        <div className="row g-4">
            <div className={`col-lg-8 ${estilos.pasos}`}>
                <h1 className={estilos.titulo}>Pago</h1>
                <CuentaRegresiva
                    segundos={checkout.segundosRestantes}
                    recibidoEn={consulta.dataUpdatedAt}
                    alTerminar={recargar}
                />
                <DatosReservados checkout={checkout} alCambiar={alCambiar} />
                <PasoPago checkout={checkout} recargar={recargar} numero={2} />
            </div>
            <div className="col-lg-4">
                <ResumenReserva checkout={checkout} />
            </div>
        </div>
    );
}

function EsqueletoCheckout() {
    return (
        <div className="row g-4" role="status" aria-label="Cargando">
            <div className="col-lg-8">
                <Esqueleto ancho="12rem" alto="2rem" style={{ marginBottom: '1rem' }} />
                <Esqueleto alto="24rem" radio="12px" />
            </div>
            <div className="col-lg-4">
                <Esqueleto alto="24rem" radio="12px" />
            </div>
        </div>
    );
}

export default function Checkout() {
    const entrega = useEntrega();
    const { carrito, idCheckout } = entrega;
    const datosCarrito = carrito.data?.data;

    const titulo = <title>{`${idCheckout ? 'Pago' : 'Envío'} · ShopCart`}</title>;

    if (carrito.esPersonal) {
        return (
            <>
                {titulo}
                <EstadoVacio
                    nivel={1}
                    icono={ShoppingCart}
                    titulo="El personal de la tienda no compra"
                    mensaje="Para comprar, ingresa con una cuenta de cliente."
                />
            </>
        );
    }
    if (idCheckout) {
        return (
            <>
                {titulo}
                <Reserva idCheckout={idCheckout} alCambiar={entrega.cambiarDatos} />
            </>
        );
    }
    if (carrito.isPending) return <EsqueletoCheckout />;
    if (carrito.isError) {
        return (
            <EstadoError
                titulo="No pudimos cargar tu carrito"
                mensaje={carrito.error.message}
                alReintentar={() => void carrito.refetch()}
            />
        );
    }
    if (!datosCarrito?.puedeComprar) {
        return (
            <>
                {titulo}
                <EstadoVacio
                    nivel={1}
                    icono={ShoppingCart}
                    titulo={
                        datosCarrito?.items.length ? 'Revisa tu carrito antes de continuar' : 'Tu carrito está vacío'
                    }
                    accion={
                        <BotonEnlace to={datosCarrito?.items.length ? '/carrito' : '/productos'}>
                            Ir al carrito
                        </BotonEnlace>
                    }
                />
            </>
        );
    }
    return (
        <>
            {titulo}
            <div className="row g-4">
                <div className={`col-lg-8 ${estilos.pasos}`}>
                    <div className={estilos.cabecera}>
                        <h1 className={estilos.titulo}>Envío</h1>
                        {entrega.usuario && (
                            <p>
                                Comprando como{' '}
                                <strong>
                                    {entrega.usuario.nombre} {entrega.usuario.apellido}
                                </strong>
                            </p>
                        )}
                    </div>
                    <PasoEntrega entrega={entrega} />
                </div>
                <div className="col-lg-4">
                    <ResumenCarrito
                        carrito={datosCarrito}
                        metodo={entrega.metodos.find((m) => m.idMetodoEnvio === entrega.idMetodo)}
                    />
                </div>
            </div>
        </>
    );
}
