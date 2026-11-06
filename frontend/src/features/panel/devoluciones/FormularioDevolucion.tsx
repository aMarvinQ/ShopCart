import { ArrowLeft } from 'lucide-react';
import { Boton } from '../../../ui/Boton';
import { AreaTexto } from '../../../ui/Campo';
import { Cantidad, Casilla, Interruptor } from '../../../ui/Controles';
import { Alerta, DialogoConfirmacion } from '../../../ui/Mensajes';
import type { PedidoPanel } from '../pedidos/hooks/useGestionPedido';
import { useRegistrarDevolucion } from './hooks/useRegistrarDevolucion';
import estilos from './devoluciones.module.scss';

/** Se muestra dentro del cajón del pedido, en lugar del detalle. Los controles no aparecen ni desaparecen: nada salta. */
export function FormularioDevolucion({ pedido, alVolver }: { pedido: PedidoPanel; alVolver: () => void }) {
    const devolucion = useRegistrarDevolucion(pedido, alVolver);

    return (
        <div className={estilos.formulario}>
            <Boton variante="enlace" tamano="sm" icono={ArrowLeft} className={estilos.volver ?? ''} onClick={alVolver}>
                Volver al pedido
            </Boton>
            {devolucion.errorLineas && <Alerta tipo="error">{devolucion.errorLineas}</Alerta>}
            <ul className={estilos.lineas}>
                {devolucion.lineas.map((linea) => {
                    const estado = devolucion.estadoDe(linea.idPedidoDetalle);
                    const maximo = devolucion.maximoDe(linea);
                    return (
                        <li
                            key={linea.idPedidoDetalle}
                            className={`card ${estado.incluida ? estilos.lineaElegida : ''} ${estilos.linea}`}
                        >
                            <Casilla
                                etiqueta={linea.nombreProducto}
                                checked={estado.incluida}
                                onChange={({ target }) => {
                                    devolucion.cambiar(linea.idPedidoDetalle, { incluida: target.checked });
                                }}
                            />
                            <small className="numero">
                                {linea.descripcionVariante && `${linea.descripcionVariante} · `}
                                {linea.sku} · se pueden devolver {maximo}
                            </small>
                            <div className={estilos.lineaControles}>
                                <Cantidad
                                    etiqueta={`Unidades de ${linea.nombreProducto}`}
                                    valor={estado.cantidad}
                                    minimo={1}
                                    maximo={maximo}
                                    disabled={!estado.incluida}
                                    alCambiar={(cantidad) => {
                                        devolucion.cambiar(linea.idPedidoDetalle, { cantidad });
                                    }}
                                />
                                <Interruptor
                                    etiqueta="Vuelve al inventario"
                                    checked={estado.reingresa}
                                    disabled={!estado.incluida}
                                    onChange={({ target }) => {
                                        devolucion.cambiar(linea.idPedidoDetalle, { reingresa: target.checked });
                                    }}
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>
            <AreaTexto
                etiqueta="Motivo"
                maxLength={500}
                ayuda="Apaga «Vuelve al inventario» si la unidad llegó dañada."
                value={devolucion.motivo}
                error={devolucion.errorMotivo}
                onChange={({ target }) => {
                    devolucion.escribirMotivo(target.value);
                }}
            />
            <Boton anchoCompleto onClick={devolucion.pedirConfirmacion}>
                Registrar devolución
            </Boton>
            <DialogoConfirmacion
                mostrar={devolucion.confirmando}
                titulo={`¿Registrar la devolución de ${String(devolucion.unidades)} ${devolucion.unidades === 1 ? 'unidad' : 'unidades'}?`}
                textoConfirmar="Sí, registrar"
                cargando={devolucion.registrando}
                alCancelar={devolucion.desistir}
                alConfirmar={devolucion.confirmar}
            >
                El reembolso lo calcula el sistema según lo pagado por cada producto; el envío no se reembolsa. Esta
                acción no se puede deshacer.
            </DialogoConfirmacion>
        </div>
    );
}
