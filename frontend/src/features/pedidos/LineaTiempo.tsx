import { Check, Circle } from 'lucide-react';
import { fechaHora } from '../../utils/formato';
import { pasosDeLinea, type DatosLinea } from './pasosLinea';
import estilos from './pedidos.module.scss';

/** Lo que pasó con el pedido y lo que falta. El panel además muestra quién hizo cada cambio. */
export function LineaTiempo({ pedido }: { pedido: DatosLinea }) {
    return (
        <ol className={estilos.linea}>
            {pasosDeLinea(pedido).map((paso, indice) => (
                <li
                    key={`${paso.codigo}-${String(indice)}`}
                    className={paso.hecho ? estilos.pasoHecho : estilos.pasoPendiente}
                >
                    <span className={estilos.pasoIcono}>
                        {paso.hecho ? <Check size={16} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                    </span>
                    <div>
                        <strong>{paso.titulo}</strong>
                        <small className="numero">
                            {paso.fecha ? fechaHora(paso.fecha) : 'Pendiente'}
                            {paso.usuario && ` · ${paso.usuario}`}
                            {paso.comentario && ` · ${paso.comentario}`}
                        </small>
                    </div>
                </li>
            ))}
        </ol>
    );
}
