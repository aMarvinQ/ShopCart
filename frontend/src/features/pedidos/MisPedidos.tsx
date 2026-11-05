import { Box, MousePointerClick } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { esErrorApi } from '../../api/errores';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { Esqueleto } from '../../ui/Esqueleto';
import { DialogoConfirmacion, EstadoError, EstadoPedido, EstadoVacio } from '../../ui/Mensajes';
import { Paginacion, Tarjeta } from '../../ui/Navegacion';
import { fechaHora, moneda } from '../../utils/formato';
import { DetallePedido } from './DetallePedido';
import { useCancelarPedido, useMiPedido, useMisPedidos, type PedidoCliente } from './hooks/usePedidos';
import estilos from './pedidos.module.scss';

function AccionesPedido({ pedido }: { pedido: PedidoCliente }) {
    const cancelar = useCancelarPedido(pedido.idPedido);
    return (
        <>
            {pedido.puedeCancelar && (
                <div>
                    <Boton variante="secundario" onClick={cancelar.pedirConfirmacion}>
                        Cancelar pedido
                    </Boton>
                    <p className={estilos.notaCancelar}>Puedes cancelar mientras el pedido no se esté preparando.</p>
                </div>
            )}
            <DialogoConfirmacion
                mostrar={cancelar.confirmando}
                titulo={`¿Cancelar el pedido ${pedido.numeroPedido}?`}
                textoConfirmar="Sí, cancelar pedido"
                cargando={cancelar.cancelando}
                alCancelar={cancelar.desistir}
                alConfirmar={cancelar.confirmar}
            >
                Se reembolsarán <b className="numero">{moneda(pedido.total)}</b> a tu tarjeta. Esta acción no se puede
                deshacer.
            </DialogoConfirmacion>
        </>
    );
}

function PanelDetalle({ id }: { id: number }) {
    const consulta = useMiPedido(id);
    if (consulta.isPending) {
        return (
            <div role="status" aria-label="Cargando pedido">
                <Esqueleto ancho="50%" alto="1.75rem" />
                <Esqueleto alto="16rem" style={{ marginTop: '1rem' }} />
            </div>
        );
    }
    if (consulta.isError) {
        return (
            <EstadoError
                titulo="No pudimos cargar el pedido"
                mensaje={consulta.error.message}
                referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                alReintentar={() => void consulta.refetch()}
            />
        );
    }
    return <DetallePedido pedido={consulta.data.data} acciones={<AccionesPedido pedido={consulta.data.data} />} />;
}

/* Escritorio: lista y detalle juntos. Móvil: una u otro, según la ruta. */
export default function MisPedidos() {
    const { id } = useParams();
    const leido = Number(id);
    const idPedido = Number.isSafeInteger(leido) && leido > 0 ? leido : null;
    const { consulta, pagina, tamanoPagina, irAPagina } = useMisPedidos();
    const pedidos = consulta.data?.data;
    const conSeleccion = idPedido !== null;

    return (
        <section className={estilos.pagina}>
            <title>Mis pedidos · ShopCart</title>
            <h1 className={estilos.titulo}>Mis pedidos</h1>
            {consulta.isError && (
                <EstadoError
                    titulo="No pudimos cargar tus pedidos"
                    mensaje={consulta.error.message}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {pedidos?.length === 0 && (
                <Tarjeta>
                    <EstadoVacio
                        icono={Box}
                        titulo="Aún no tienes pedidos"
                        mensaje="Cuando compres, aquí podrás seguir tus envíos."
                        accion={<BotonEnlace to="/productos">Explorar productos</BotonEnlace>}
                    />
                </Tarjeta>
            )}
            {(consulta.isPending || (pedidos && pedidos.length > 0)) && (
                <div className="row g-4">
                    <div className={`col-xl-5 ${conSeleccion ? 'd-none d-xl-block' : ''}`}>
                        <ul className={estilos.lista}>
                            {consulta.isPending &&
                                Array.from({ length: 4 }, (_, i) => (
                                    <li key={i}>
                                        <Esqueleto alto="5.5rem" radio="12px" />
                                    </li>
                                ))}
                            {pedidos?.map((p) => (
                                <li key={p.idPedido}>
                                    <Link
                                        to={`/cuenta/pedidos/${String(p.idPedido)}`}
                                        aria-current={p.idPedido === idPedido ? 'page' : undefined}
                                        className={`card ${estilos.pedido} ${p.idPedido === idPedido ? estilos.pedidoActivo : ''}`}
                                    >
                                        <span className={estilos.pedidoFila}>
                                            <strong className="numero">{p.numeroPedido}</strong>
                                            <EstadoPedido codigo={p.codigoEstado} />
                                        </span>
                                        <span className={estilos.pedidoFila}>
                                            <small className="numero">
                                                {fechaHora(p.fechaPedido)} · {p.articulos}{' '}
                                                {p.articulos === 1 ? 'producto' : 'productos'}
                                            </small>
                                            <strong className="numero">{moneda(p.total)}</strong>
                                        </span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                        {consulta.data && (
                            <div className="mt-3">
                                <Paginacion
                                    pagina={pagina}
                                    tamanoPagina={tamanoPagina}
                                    totalRegistros={consulta.data.meta.totalRegistros}
                                    unidad="pedidos"
                                    alCambiar={irAPagina}
                                />
                            </div>
                        )}
                    </div>
                    <div className={`col-xl-7 ${conSeleccion ? '' : 'd-none d-xl-block'}`}>
                        {conSeleccion && (
                            <Link to="/cuenta/pedidos" className={`d-xl-none ${estilos.volver}`}>
                                ← Volver a mis pedidos
                            </Link>
                        )}
                        <Tarjeta className={estilos.panel}>
                            {idPedido !== null ? (
                                <PanelDetalle key={idPedido} id={idPedido} />
                            ) : (
                                <EstadoVacio
                                    icono={MousePointerClick}
                                    titulo="Elige un pedido"
                                    mensaje="Aquí verás su estado y detalle."
                                />
                            )}
                        </Tarjeta>
                    </div>
                </div>
            )}
        </section>
    );
}
