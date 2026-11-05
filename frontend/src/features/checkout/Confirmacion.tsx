import { Check, Copy, PackageSearch } from 'lucide-react';
import { useLocation } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { useAvisos } from '../../ui/avisos/contexto';
import { Boton, BotonEnlace } from '../../ui/Boton';
import { EstadoPedido, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { fechaHora, moneda } from '../../utils/formato';
import { textoPlazo } from '../tienda/textos';
import type { DatosConfirmacion } from './hooks/useCheckout';
import estilos from './checkout.module.scss';

export default function Confirmacion() {
    const { state } = useLocation() as { state: DatosConfirmacion | null };
    const { usuario } = useSesion();
    const avisar = useAvisos();

    if (!state) {
        return (
            <>
                <title>Confirmación · ShopCart</title>
                <EstadoVacio
                    nivel={1}
                    icono={PackageSearch}
                    titulo="No hay una compra reciente que mostrar"
                    accion={
                        <BotonEnlace to={usuario ? '/cuenta/pedidos' : '/'}>
                            {usuario ? 'Ver mis pedidos' : 'Ir a la tienda'}
                        </BotonEnlace>
                    }
                />
            </>
        );
    }

    const { pedido, tokenSeguimiento, diasEstimadosMin, diasEstimadosMax } = state;
    const pago = pedido.pagos.find((p) => p.estado === 'APROBADO');
    const rutaSeguimiento = `/seguimiento/${tokenSeguimiento}`;

    const copiar = () => {
        navigator.clipboard.writeText(`${window.location.origin}${rutaSeguimiento}`).then(
            () => {
                avisar({ tipo: 'exito', titulo: 'Enlace copiado' });
            },
            () => {
                avisar({
                    tipo: 'error',
                    titulo: 'No se pudo copiar',
                    detalle: 'Abre el seguimiento y guarda su dirección.',
                });
            },
        );
    };

    return (
        <div className={estilos.confirmacion}>
            <title>{`Pedido ${pedido.numeroPedido} · ShopCart`}</title>
            <div className={estilos.gracias}>
                <span className={estilos.graciasIcono}>
                    <Check size={24} aria-hidden="true" />
                </span>
                <div>
                    <h1>¡Gracias, {pedido.nombreContacto}! Tu pedido está confirmado.</h1>
                    <p>Guarda el enlace de seguimiento para consultar su estado cuando quieras.</p>
                </div>
            </div>
            <Tarjeta className={estilos.confirmacionTarjeta}>
                <div className={estilos.confirmacionCabecera}>
                    <div>
                        <small>Número de pedido</small>
                        <strong className="numero">{pedido.numeroPedido}</strong>
                    </div>
                    <EstadoPedido codigo={pedido.codigoEstado} />
                </div>
                <dl className="row g-3 mb-0">
                    <div className="col-sm-6">
                        <dt>Fecha</dt>
                        <dd className="numero">{fechaHora(pedido.fechaPedido)}</dd>
                    </div>
                    <div className="col-sm-6">
                        <dt>Entrega estimada</dt>
                        <dd>
                            {pedido.nombreMetodoEnvio} · {textoPlazo(diasEstimadosMin, diasEstimadosMax)}
                        </dd>
                    </div>
                    <div className="col-sm-6">
                        <dt>Enviar a</dt>
                        <dd>
                            {pedido.envioLinea1}, {pedido.envioMunicipio}, {pedido.departamento}
                        </dd>
                    </div>
                    <div className="col-sm-6">
                        <dt>Total pagado</dt>
                        <dd className="numero">
                            {moneda(pedido.total)}
                            {pago && ` · ${pago.marca} •••• ${pago.ultimos4}`}
                        </dd>
                    </div>
                </dl>
            </Tarjeta>
            <div className={estilos.confirmacionAcciones}>
                {usuario ? (
                    <BotonEnlace to={`/cuenta/pedidos/${String(pedido.idPedido)}`}>Ver mi pedido</BotonEnlace>
                ) : (
                    <BotonEnlace to={rutaSeguimiento}>Seguir mi pedido</BotonEnlace>
                )}
                <Boton variante="secundario" icono={Copy} onClick={copiar}>
                    Copiar enlace de seguimiento
                </Boton>
                <BotonEnlace to="/" variante="secundario">
                    Seguir comprando
                </BotonEnlace>
            </div>
        </div>
    );
}
