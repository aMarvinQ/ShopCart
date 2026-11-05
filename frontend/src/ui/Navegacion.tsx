import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import estilos from './Navegacion.module.scss';

/** Tarjeta blanca con borde: el contenedor de casi todo el sistema. */
export function Tarjeta({ className, children }: { className?: string | undefined; children: ReactNode }) {
    return <div className={`card ${estilos.tarjeta} ${className ?? ''}`}>{children}</div>;
}

export function MigaPan({ rutas }: { rutas: readonly { etiqueta: string; a?: string }[] }) {
    return (
        <nav aria-label="Ruta de navegación">
            <ol className="breadcrumb">
                {rutas.map(({ etiqueta, a }) => (
                    <li
                        key={etiqueta}
                        className={`breadcrumb-item ${a ? '' : 'active'}`}
                        aria-current={a ? undefined : 'page'}
                    >
                        {a ? <Link to={a}>{etiqueta}</Link> : etiqueta}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

export function Pestanas({
    pestanas,
    etiqueta,
}: {
    pestanas: readonly { id: string; etiqueta: string; contenido: ReactNode }[];
    etiqueta: string;
}) {
    const base = useId();
    const [activa, setActiva] = useState(0);
    const lista = useRef<HTMLDivElement>(null);

    /* Flechas, Inicio y Fin entre pestañas; en la lista solo la activa recibe el foco con Tab. */
    const alTeclear = (evento: KeyboardEvent) => {
        const ultima = pestanas.length - 1;
        const destinos: Record<string, number> = {
            ArrowRight: activa === ultima ? 0 : activa + 1,
            ArrowLeft: activa === 0 ? ultima : activa - 1,
            Home: 0,
            End: ultima,
        };
        const destino = destinos[evento.key];
        if (destino === undefined) return;
        evento.preventDefault();
        setActiva(destino);
        const boton = lista.current?.children[destino];
        if (boton instanceof HTMLElement) boton.focus();
    };

    return (
        <div>
            <div ref={lista} role="tablist" aria-label={etiqueta} className={`nav nav-underline ${estilos.pestanas}`}>
                {pestanas.map(({ id, etiqueta: texto }, indice) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        id={`${base}-${id}`}
                        aria-selected={indice === activa}
                        aria-controls={`${base}-${id}-panel`}
                        tabIndex={indice === activa ? 0 : -1}
                        onKeyDown={alTeclear}
                        className={`nav-link ${indice === activa ? 'active' : ''}`}
                        onClick={() => {
                            setActiva(indice);
                        }}
                    >
                        {texto}
                    </button>
                ))}
            </div>
            {pestanas.map(({ id, contenido }, indice) => (
                <div
                    key={id}
                    role="tabpanel"
                    id={`${base}-${id}-panel`}
                    aria-labelledby={`${base}-${id}`}
                    hidden={indice !== activa}
                    className={estilos.panelPestana}
                >
                    {indice === activa && contenido}
                </div>
            ))}
        </div>
    );
}

/** Siempre la primera, la última y las vecinas de la actual; un hueco de una sola página se muestra. */
function paginasVisibles(actual: number, total: number): (number | 'hueco-1' | 'hueco-2')[] {
    const elegidas = [1, total, actual - 1, actual, actual + 1, ...(actual <= 2 ? [3] : [])];
    const ordenadas = [...new Set(elegidas)].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const resultado: (number | 'hueco-1' | 'hueco-2')[] = [];
    let anterior = 0;
    for (const pagina of ordenadas) {
        if (pagina - anterior === 2) resultado.push(pagina - 1);
        else if (pagina - anterior > 2) resultado.push(anterior === 1 ? 'hueco-1' : 'hueco-2');
        resultado.push(pagina);
        anterior = pagina;
    }
    return resultado;
}

export function Paginacion({
    pagina,
    tamanoPagina,
    totalRegistros,
    unidad = 'registros',
    alCambiar,
}: {
    pagina: number;
    tamanoPagina: number;
    totalRegistros: number;
    unidad?: string;
    alCambiar: (pagina: number) => void;
}) {
    const totalPaginas = Math.max(1, Math.ceil(totalRegistros / tamanoPagina));
    const desde = totalRegistros === 0 ? 0 : (pagina - 1) * tamanoPagina + 1;
    const hasta = Math.min(pagina * tamanoPagina, totalRegistros);
    return (
        <div className={estilos.paginacion}>
            <span className={`${estilos.resumen} numero`}>
                {desde}–{hasta} de {totalRegistros} {unidad}
            </span>
            {totalPaginas > 1 && (
                <nav aria-label="Paginación">
                    <ul className={`pagination numero ${estilos.paginas}`}>
                        <li className={`page-item ${pagina <= 1 ? 'disabled' : ''}`}>
                            <button
                                type="button"
                                className="page-link"
                                aria-label="Página anterior"
                                disabled={pagina <= 1}
                                onClick={() => {
                                    alCambiar(pagina - 1);
                                }}
                            >
                                <ChevronLeft size={20} aria-hidden="true" />
                            </button>
                        </li>
                        {paginasVisibles(pagina, totalPaginas).map((p) =>
                            typeof p === 'number' ? (
                                <li key={p} className={`page-item ${p === pagina ? 'active' : estilos.soloAncho}`}>
                                    <button
                                        type="button"
                                        className="page-link"
                                        aria-label={`Página ${String(p)}`}
                                        aria-current={p === pagina ? 'page' : undefined}
                                        onClick={() => {
                                            alCambiar(p);
                                        }}
                                    >
                                        {p}
                                    </button>
                                </li>
                            ) : (
                                <li key={p} className={`page-item disabled ${estilos.soloAncho}`} aria-hidden="true">
                                    <span className="page-link">…</span>
                                </li>
                            ),
                        )}
                        <li className={`page-item ${pagina >= totalPaginas ? 'disabled' : ''}`}>
                            <button
                                type="button"
                                className="page-link"
                                aria-label="Página siguiente"
                                disabled={pagina >= totalPaginas}
                                onClick={() => {
                                    alCambiar(pagina + 1);
                                }}
                            >
                                <ChevronRight size={20} aria-hidden="true" />
                            </button>
                        </li>
                    </ul>
                </nav>
            )}
        </div>
    );
}
