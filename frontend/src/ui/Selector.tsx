import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { MarcoCampo, type PropsMarcoCampo } from './Campo';
import estilos from './Selector.module.scss';

export interface OpcionSelector<T extends string = string> {
    valor: T;
    etiqueta: string;
    detalle?: string;
}

/** Espacio que necesita la lista (2 líneas de margen incluidas): si no cabe abajo, se abre hacia arriba. */
const ALTO_LISTA_PX = 296;
const ESPERA_ESCRITURA_MS = 500;

/*
    Selector propio: nunca la lista nativa del navegador. Sigue el patrón "select-only combobox" de
    WAI-ARIA: el foco se queda en el botón y la opción activa se anuncia con aria-activedescendant.
    Al perder el foco se cierra, así que no hacen falta oyentes globales.
*/
export function Selector<T extends string>({
    opciones,
    valor,
    alCambiar,
    marcador = 'Selecciona una opción',
    disabled = false,
    onBlur,
    etiqueta,
    ayuda,
    error,
    compacto,
    ancho,
}: PropsMarcoCampo & {
    opciones: readonly OpcionSelector<T>[];
    valor: T | null | undefined;
    alCambiar: (valor: T) => void;
    marcador?: string;
    disabled?: boolean;
    onBlur?: () => void;
}) {
    const id = useId();
    const boton = useRef<HTMLButtonElement>(null);
    const lista = useRef<HTMLUListElement>(null);
    const [abierto, setAbierto] = useState(false);
    const [haciaArriba, setHaciaArriba] = useState(false);
    const [activa, setActiva] = useState(0);
    const escrito = useRef({ texto: '', limpiar: undefined as ReturnType<typeof setTimeout> | undefined });

    const elegida = opciones.findIndex((opcion) => opcion.valor === valor);

    useEffect(() => {
        if (abierto) lista.current?.children[activa]?.scrollIntoView({ block: 'nearest' });
    }, [abierto, activa]);

    useEffect(() => {
        const memoria = escrito.current;
        return () => {
            clearTimeout(memoria.limpiar);
        };
    }, []);

    const abrir = (inicial = Math.max(elegida, 0)) => {
        const caja = boton.current?.getBoundingClientRect();
        setHaciaArriba(
            caja !== undefined && window.innerHeight - caja.bottom < ALTO_LISTA_PX && caja.top > ALTO_LISTA_PX,
        );
        setActiva(inicial);
        setAbierto(true);
    };

    const elegir = (indice: number) => {
        const opcion = opciones[indice];
        if (opcion) alCambiar(opcion.valor);
        setAbierto(false);
    };

    /* Escribir salta a la primera opción que empieza con ese texto. */
    const buscar = (letra: string) => {
        const memoria = escrito.current;
        clearTimeout(memoria.limpiar);
        memoria.texto += letra.toLocaleLowerCase('es');
        memoria.limpiar = setTimeout(() => {
            memoria.texto = '';
        }, ESPERA_ESCRITURA_MS);
        const hallada = opciones.findIndex((o) => o.etiqueta.toLocaleLowerCase('es').startsWith(memoria.texto));
        if (hallada < 0) return;
        if (abierto) setActiva(hallada);
        else abrir(hallada);
    };

    const alTeclear = (evento: KeyboardEvent<HTMLButtonElement>) => {
        const { key } = evento;
        if (key.length === 1 && key !== ' ' && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
            buscar(key);
            return;
        }
        if (!abierto) {
            if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(key)) {
                evento.preventDefault();
                abrir();
            }
            return;
        }
        const ultima = opciones.length - 1;
        const movimientos: Record<string, () => void> = {
            ArrowDown: () => {
                setActiva((a) => Math.min(a + 1, ultima));
            },
            ArrowUp: () => {
                setActiva((a) => Math.max(a - 1, 0));
            },
            Home: () => {
                setActiva(0);
            },
            End: () => {
                setActiva(ultima);
            },
            Enter: () => {
                elegir(activa);
            },
            ' ': () => {
                elegir(activa);
            },
            Escape: () => {
                setAbierto(false);
            },
        };
        const movimiento = movimientos[key];
        if (movimiento) {
            evento.preventDefault();
            movimiento();
        }
    };

    return (
        <MarcoCampo
            id={id}
            etiqueta={etiqueta}
            ayuda={ayuda}
            error={error}
            {...(compacto !== undefined && { compacto })}
            {...(ancho !== undefined && { ancho })}
        >
            <div className={estilos.selector}>
                <button
                    ref={boton}
                    id={id}
                    type="button"
                    role="combobox"
                    disabled={disabled}
                    aria-haspopup="listbox"
                    aria-expanded={abierto}
                    aria-controls={`${id}-lista`}
                    aria-labelledby={`${id}-etiqueta`}
                    aria-activedescendant={abierto ? `${id}-opcion-${String(activa)}` : undefined}
                    aria-invalid={Boolean(error)}
                    aria-describedby={compacto ? undefined : `${id}-pie`}
                    className={`${estilos.boton} ${error ? estilos.botonError : ''}`}
                    onClick={() => {
                        if (abierto) setAbierto(false);
                        else abrir();
                    }}
                    onKeyDown={alTeclear}
                    onBlur={() => {
                        setAbierto(false);
                        onBlur?.();
                    }}
                >
                    <span className={elegida < 0 ? estilos.marcador : estilos.valor}>
                        {opciones[elegida]?.etiqueta ?? marcador}
                    </span>
                    <ChevronDown size={20} className={estilos.flecha} aria-hidden="true" />
                </button>
                <ul
                    ref={lista}
                    id={`${id}-lista`}
                    role="listbox"
                    aria-labelledby={`${id}-etiqueta`}
                    hidden={!abierto}
                    className={`${estilos.lista} ${haciaArriba ? estilos.haciaArriba : ''}`}
                    // El foco se queda en el botón: tocar la lista o su barra de scroll no la cierra.
                    onMouseDown={(evento) => {
                        evento.preventDefault();
                    }}
                >
                    {opciones.map((opcion, indice) => (
                        // El teclado lo atiende el botón, que conserva el foco (aria-activedescendant).
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                        <li
                            key={opcion.valor}
                            id={`${id}-opcion-${String(indice)}`}
                            role="option"
                            aria-selected={indice === elegida}
                            className={`${estilos.opcion} ${indice === activa ? estilos.opcionActiva : ''}`}
                            onMouseEnter={() => {
                                setActiva(indice);
                            }}
                            onClick={() => {
                                elegir(indice);
                            }}
                        >
                            <span>
                                {opcion.etiqueta}
                                {opcion.detalle && <small>{opcion.detalle}</small>}
                            </span>
                            {indice === elegida && <Check size={20} className={estilos.marca} aria-hidden="true" />}
                        </li>
                    ))}
                </ul>
            </div>
        </MarcoCampo>
    );
}
