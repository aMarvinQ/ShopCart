import { ChevronRight, CircleX, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { AreaTexto } from '../../../ui/Campo';
import { Esqueleto } from '../../../ui/Esqueleto';
import { Cajon, DialogoConfirmacion, EstadoError, EstadoPedido } from '../../../ui/Mensajes';
import { fechaHora, moneda } from '../../../utils/formato';
import { LineaTiempo } from '../../pedidos/LineaTiempo';
import { FormularioDevolucion } from '../devoluciones/FormularioDevolucion';
import { lineasDevolvibles } from '../devoluciones/hooks/useRegistrarDevolucion';
import {
    avanceDe,
    useAvanzarEstado,
    useCancelarPedidoPanel,
    useDetallePedidoPanel,
    type PedidoPanel,
} from './hooks/useGestionPedido';
import estilos from './pedidos.module.scss';

function Contenido({ pedido }: { pedido: PedidoPanel }) {
    return (
        <>
            <div>
                <EstadoPedido codigo={pedido.codigoEstado} />
            </div>
            <LineaTiempo pedido={pedido} />
            <section>
                <h3 className={estilos.rotulo}>Cliente</h3>
                <p className={estilos.dato}>
                    <strong>{pedido.nombreContacto}</strong>
                    {pedido.idUsuario === null && ' · Invitado'}
                    <br />
                    {pedido.correoContacto} · {pedido.telefonoContacto}
                    <br />
                    {pedido.envioLinea1}
                    {pedido.envioLinea2 && `, ${pedido.envioLinea2}`}, {pedido.envioMunicipio}, {pedido.departamento}
                    {pedido.envioReferencias && (
                        <>
                            <br />
                            {pedido.envioReferencias}
                        </>
                    )}
                </p>
            </section>
            <section>
                <h3 className={estilos.rotulo}>Productos</h3>
                <ul className={estilos.productos}>
                    {pedido.lineas.map((l) => (
                        <li key={l.idPedidoDetalle}>
                            <div>
                                <strong>
                                    {l.cantidad} × {l.nombreProducto}
                                </strong>
                                <small className="numero">
                                    {l.descripcionVariante && `${l.descripcionVariante} · `}
                                    {l.sku}
                                    {l.cantidadDevuelta > 0 && ` · devueltas: ${String(l.cantidadDevuelta)}`}
                                </small>
                            </div>
                            <span className="numero">{moneda(l.totalLinea)}</span>
                        </li>
                    ))}
                </ul>
                <dl className={estilos.importes}>
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
                        <dt>Total</dt>
                        <dd className="numero">{moneda(pedido.total)}</dd>
                    </div>
                </dl>
            </section>
            {pedido.devoluciones.length > 0 && (
                <section>
                    <h3 className={estilos.rotulo}>Devoluciones</h3>
                    <ul className={estilos.productos}>
                        {pedido.devoluciones.map((d) => (
                            <li key={d.idDevolucion}>
                                <div>
                                    <strong>{d.motivo}</strong>
                                    <small className="numero">
                                        {fechaHora(d.fecha)}
                                        {d.usuario && ` · ${d.usuario}`}
                                    </small>
                                    {d.lineas.map((l) => (
                                        <small key={l.sku} className="d-block numero">
                                            {l.cantidad} × {l.nombreProducto} ·{' '}
                                            {l.reingresa ? 'volvió al inventario' : 'dañado, no reingresó'}
                                        </small>
                                    ))}
                                </div>
                                <span className="numero">{moneda(d.montoReembolso)}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}

function Acciones({ pedido, alDevolver }: { pedido: PedidoPanel; alDevolver: () => void }) {
    const avance = avanceDe(pedido.codigoEstado);
    const [comentario, setComentario] = useState('');
    const { avanzar, avanzando } = useAvanzarEstado();
    const cancelar = useCancelarPedidoPanel(pedido.idPedido);

    const puedeDevolver = lineasDevolvibles(pedido).length > 0;

    if (!avance && !pedido.puedeCancelar && !puedeDevolver) return null;

    return (
        <div className={estilos.acciones}>
            {avance && (
                <AreaTexto
                    etiqueta="Comentario (opcional)"
                    filas={2}
                    maxLength={500}
                    placeholder="Por ejemplo, la guía de la transportista"
                    value={comentario}
                    onChange={({ target }) => {
                        setComentario(target.value);
                    }}
                />
            )}
            <div className={estilos.accionesBotones}>
                {puedeDevolver && (
                    <Boton variante="secundario" anchoCompleto icono={Undo2} onClick={alDevolver}>
                        Registrar devolución
                    </Boton>
                )}
                {avance && (
                    <Boton
                        anchoCompleto
                        iconoDerecha={ChevronRight}
                        cargando={avanzando}
                        onClick={() => {
                            avanzar(pedido.idPedido, pedido.codigoEstado, comentario, () => {
                                setComentario('');
                            });
                        }}
                    >
                        {avance.accion}
                    </Boton>
                )}
                {pedido.puedeCancelar && (
                    <Boton
                        variante="fantasma"
                        icono={CircleX}
                        className={estilos.cancelar ?? ''}
                        aria-label="Cancelar pedido"
                        title="Cancelar pedido"
                        disabled={avanzando}
                        onClick={cancelar.pedirConfirmacion}
                    />
                )}
            </div>
            <DialogoConfirmacion
                mostrar={cancelar.confirmando}
                titulo={`¿Cancelar el pedido ${pedido.numeroPedido}?`}
                textoConfirmar="Sí, cancelar pedido"
                cargando={cancelar.cancelando}
                alCancelar={cancelar.desistir}
                alConfirmar={cancelar.confirmar}
            >
                <p className="mb-2">
                    Se reembolsarán <b className="numero">{moneda(pedido.total)}</b> a {pedido.nombreContacto}. No se
                    puede deshacer.
                </p>
                <AreaTexto
                    etiqueta="Motivo"
                    filas={2}
                    maxLength={500}
                    value={cancelar.motivo}
                    error={cancelar.error}
                    onChange={({ target }) => {
                        cancelar.escribirMotivo(target.value);
                    }}
                />
            </DialogoConfirmacion>
        </div>
    );
}

/** Detalle en un cajón, sin salir de la lista. Abre y cierra según la URL; al cerrar, el foco vuelve a la fila. */
export function DetallePedidoPanel({ id, alCerrar }: { id: number | null; alCerrar: () => void }) {
    const consulta = useDetallePedidoPanel(id);
    const pedido = consulta.data?.data;
    const pago = pedido?.pagos.find((p) => p.estado === 'APROBADO') ?? pedido?.pagos[0];
    // Se guarda de qué pedido es: al abrir otro, o cerrar con Atrás, vuelve solo al detalle.
    const [devolviendoId, setDevolviendoId] = useState<number | null>(null);
    const devolviendo = pedido !== undefined && devolviendoId === pedido.idPedido;
    const volver = () => {
        setDevolviendoId(null);
    };

    return (
        <Cajon
            mostrar={id !== null}
            titulo={devolviendo ? `Devolución de ${pedido.numeroPedido}` : (pedido?.numeroPedido ?? 'Pedido')}
            subtitulo={
                pedido && `${fechaHora(pedido.fechaPedido)}${pago ? ` · ${pago.marca} •••• ${pago.ultimos4}` : ''}`
            }
            alCerrar={() => {
                volver();
                alCerrar();
            }}
            pie={
                pedido &&
                !devolviendo && (
                    <Acciones
                        key={pedido.idPedido}
                        pedido={pedido}
                        alDevolver={() => {
                            setDevolviendoId(pedido.idPedido);
                        }}
                    />
                )
            }
        >
            {consulta.isPending && (
                <div role="status" aria-label="Cargando pedido">
                    <Esqueleto ancho="40%" alto="1.75rem" />
                    <Esqueleto alto="20rem" style={{ marginTop: '1rem' }} />
                </div>
            )}
            {consulta.isError && (
                <EstadoError
                    titulo="No pudimos cargar el pedido"
                    mensaje={consulta.error.message}
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {pedido &&
                (devolviendo ? (
                    <FormularioDevolucion key={pedido.idPedido} pedido={pedido} alVolver={volver} />
                ) : (
                    <Contenido pedido={pedido} />
                ))}
        </Cajon>
    );
}
