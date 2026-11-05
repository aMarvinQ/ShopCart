import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EstadoError } from '../../ui/Mensajes';
import { useAlLlegar } from '../../utils/useAlLlegar';
import { useFilaProductos, type FiltrosProductos } from './hooks/useCatalogo';
import { useFilaDeslizable } from './hooks/useFilaDeslizable';
import { EsqueletoTarjeta, TarjetaProducto } from './TarjetaProducto';
import estilos from './tienda.module.scss';

const PRODUCTOS_POR_FILA = 10;

/** Fila deslizable: no consulta hasta acercarse a la pantalla. Flechas en escritorio, dedo en móvil. */
export function FilaProductos({
    titulo,
    filtros,
    verTodo,
    excluir,
    prioridad = false,
}: {
    titulo: string;
    filtros: FiltrosProductos;
    verTodo: string;
    excluir?: number;
    prioridad?: boolean;
}) {
    const [vista, setVista] = useState(prioridad);
    const seccion = useAlLlegar<HTMLElement>(() => {
        setVista(true);
    }, !vista);
    const consulta = useFilaProductos(filtros, PRODUCTOS_POR_FILA + (excluir === undefined ? 0 : 1), vista);
    const productos = consulta.data?.data.filter((p) => p.idProducto !== excluir).slice(0, PRODUCTOS_POR_FILA);
    const cantidad = productos?.length ?? 0;
    const { pista, puede, medir, mover } = useFilaDeslizable(cantidad);

    if (consulta.isSuccess && cantidad === 0) return null;

    return (
        <section ref={seccion} className={estilos.fila} aria-label={titulo}>
            <div className={estilos.filaCabecera}>
                <h2>{titulo}</h2>
                <Link to={verTodo} className={estilos.verTodo}>
                    Ver todo
                </Link>
                <div className={estilos.flechas}>
                    <button
                        type="button"
                        aria-label={`Anterior en ${titulo}`}
                        disabled={!puede.atras}
                        onClick={() => {
                            mover(-1);
                        }}
                    >
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-label={`Siguiente en ${titulo}`}
                        disabled={!puede.adelante}
                        onClick={() => {
                            mover(1);
                        }}
                    >
                        <ChevronRight size={20} aria-hidden="true" />
                    </button>
                </div>
            </div>
            {consulta.isError ? (
                <EstadoError titulo="No pudimos cargar estos productos" alReintentar={() => void consulta.refetch()} />
            ) : (
                <div ref={pista} className={estilos.pista} onScroll={medir}>
                    {productos
                        ? productos.map((p) => (
                              <div key={p.idProducto} className={estilos.pistaCelda}>
                                  <TarjetaProducto producto={p} prioridad={prioridad} />
                              </div>
                          ))
                        : Array.from({ length: 5 }, (_, i) => (
                              <div key={i} className={estilos.pistaCelda}>
                                  <EsqueletoTarjeta />
                              </div>
                          ))}
                </div>
            )}
        </section>
    );
}
