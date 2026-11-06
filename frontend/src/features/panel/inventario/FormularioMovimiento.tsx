import { X } from 'lucide-react';
import { Boton } from '../../../ui/Boton';
import { AreaTexto, Campo } from '../../../ui/Campo';
import { Alerta } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { BuscadorVariantes } from './BuscadorVariantes';
import type { FilaExistencia } from './hooks/useExistencias';
import { TIPOS_MOVIMIENTO, useMovimiento } from './hooks/useMovimiento';
import estilos from './inventario.module.scss';

export function FormularioMovimiento({
    inicial,
    alTerminar,
}: {
    inicial: FilaExistencia | null;
    alTerminar: () => void;
}) {
    const movimiento = useMovimiento(inicial, alTerminar);

    return (
        <form
            noValidate
            className={estilos.formulario}
            onSubmit={(evento) => {
                evento.preventDefault();
                movimiento.enviar();
            }}
        >
            {movimiento.errorGeneral && <Alerta tipo="error">{movimiento.errorGeneral}</Alerta>}
            <Selector
                etiqueta="Tipo de movimiento"
                valor={movimiento.tipo}
                opciones={TIPOS_MOVIMIENTO}
                alCambiar={movimiento.elegirTipo}
            />
            <BuscadorVariantes
                alElegir={movimiento.agregar}
                yaElegidas={new Set(movimiento.lineas.map((l) => l.idVariante))}
                alQuitar={movimiento.quitar}
            />
            {movimiento.lineas.length > 0 && (
                <ul className={estilos.lineas}>
                    {movimiento.lineas.map((l) => (
                        <li key={l.idVariante} className="card">
                            <div className={estilos.lineaDatos}>
                                <strong>{l.producto}</strong>
                                <small className={`${estilos.detalle} numero`}>
                                    {l.sku}
                                    {l.descripcion && ` · ${l.descripcion}`} · disponible {l.disponible}
                                </small>
                            </div>
                            <div className={estilos.lineaCantidad}>
                                <Campo
                                    etiqueta={`Cantidad de ${l.sku}`}
                                    compacto
                                    type="number"
                                    min="1"
                                    max="100000"
                                    inputMode="numeric"
                                    value={l.cantidad}
                                    aria-invalid={movimiento.mostrarErrores && !movimiento.cantidadValida(l.cantidad)}
                                    onChange={({ target }) => {
                                        movimiento.cambiarCantidad(l.idVariante, target.value);
                                    }}
                                />
                            </div>
                            <Boton
                                variante="fantasma"
                                tamano="sm"
                                icono={X}
                                aria-label={`Quitar ${l.sku}`}
                                onClick={() => {
                                    movimiento.quitar(l.idVariante);
                                }}
                            />
                        </li>
                    ))}
                </ul>
            )}
            {movimiento.mostrarErrores && movimiento.lineas.some((l) => !movimiento.cantidadValida(l.cantidad)) && (
                <Alerta tipo="error">Cada cantidad debe ser un número entero entre 1 y 100,000.</Alerta>
            )}
            <AreaTexto
                etiqueta={movimiento.esAjuste ? 'Motivo' : 'Motivo (opcional)'}
                filas={2}
                maxLength={300}
                value={movimiento.motivo}
                error={movimiento.errorMotivo}
                onChange={({ target }) => {
                    movimiento.escribirMotivo(target.value);
                }}
            />
            <Boton type="submit" anchoCompleto cargando={movimiento.registrando}>
                Registrar movimiento
            </Boton>
        </form>
    );
}
