import { MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import { EstadoPedido } from '../../ui/Mensajes';
import { fechaHora, moneda } from '../../utils/formato';
import type { PedidoCliente } from './hooks/usePedidos';
import { LineaTiempo } from './LineaTiempo';
import estilos from './pedidos.module.scss';

/** Detalle de un pedido: lo comparten Mis pedidos y el seguimiento sin sesión. */
export function DetallePedido({
    pedido,
    acciones,
    nivel = 2,
}: {
    pedido: PedidoCliente;
    acciones?: ReactNode;
    nivel?: 1 | 2;
}) {
    const Titulo = nivel === 1 ? 'h1' : 'h2';
    const pago = pedido.pagos.find((p) => p.estado === 'APROBADO') ?? pedido.pagos[0];
    return (
        <div className={estilos.detalle}>
            <div className={estilos.detalleCabecera}>
                <div>
                    <Titulo className={`${estilos.detalleTitulo} numero`}>Pedido {pedido.numeroPedido}</Titulo>
                    <p className="numero">
                        {fechaHora(pedido.fechaPedido)}
                        {pago && ` · ${pago.marca} •••• ${pago.ultimos4}`}
                    </p>
                </div>
                <EstadoPedido codigo={pedido.codigoEstado} />
            </div>

            <LineaTiempo pedido={pedido} />

            <ul className={estilos.productos}>
                {pedido.lineas.map((l) => (
                    <li key={l.idPedidoDetalle}>
                        <div>
                            <strong>{l.nombreProducto}</strong>
                            <small className="numero">
                                {l.cantidad} u{l.descripcionVariante && ` · ${l.descripcionVariante}`}
                                {l.cantidadDevuelta > 0 && ` · ${String(l.cantidadDevuelta)} devueltas`}
                            </small>
                        </div>
                        <span className="numero">{moneda(l.totalLinea)}</span>
                    </li>
                ))}
            </ul>

            <dl className={estilos.importes}>
                <div>
                    <dt>Subtotal</dt>
                    <dd className="numero">{moneda(pedido.subtotal)}</dd>
                </div>
                {pedido.descuento > 0 && (
                    <div>
                        <dt>Cupón {pedido.codigoCupon}</dt>
                        <dd className="numero">−{moneda(pedido.descuento)}</dd>
                    </div>
                )}
                <div>
                    <dt>{pedido.nombreMetodoEnvio}</dt>
                    <dd className="numero">{pedido.costoEnvio === 0 ? 'Sin costo' : moneda(pedido.costoEnvio)}</dd>
                </div>
                <div className={estilos.total}>
                    <dt>Total pagado</dt>
                    <dd className="numero">{moneda(pedido.total)}</dd>
                </div>
            </dl>

            <div className={estilos.envio}>
                <MapPin size={18} aria-hidden="true" />
                <address>
                    <strong>{pedido.envioNombre}</strong>
                    <br />
                    {pedido.envioLinea1}
                    {pedido.envioLinea2 && `, ${pedido.envioLinea2}`}, {pedido.envioMunicipio}, {pedido.departamento}
                </address>
            </div>

            {acciones}
        </div>
    );
}
