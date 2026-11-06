import { Minus, Plus, X } from 'lucide-react';
import type { ComponentProps } from 'react';
import estilos from './Controles.module.scss';

type PropsMarcable = Omit<ComponentProps<'input'>, 'type' | 'className'> & { etiqueta: string };

export function Casilla({ etiqueta, ...resto }: PropsMarcable) {
    return (
        <label className={estilos.opcion}>
            <input {...resto} type="checkbox" className={`form-check-input ${estilos.casilla}`} />
            {etiqueta}
        </label>
    );
}

/** Selección única; `contador` a la derecha, como los productos de una categoría. */
export function Radio({ etiqueta, contador, ...resto }: PropsMarcable & { contador?: number }) {
    return (
        <label className={estilos.opcion}>
            <input {...resto} type="radio" className={`form-check-input ${estilos.casilla}`} />
            {etiqueta}
            {contador !== undefined && <span className={`${estilos.contador} numero`}>{contador}</span>}
        </label>
    );
}

/** Con `etiquetaOculta`, el texto solo lo leen los lectores de pantalla: para filas de una tabla. */
export function Interruptor({
    etiqueta,
    etiquetaOculta = false,
    ...resto
}: PropsMarcable & { etiquetaOculta?: boolean }) {
    return (
        <label className={`form-switch ${estilos.opcion}`}>
            <input {...resto} type="checkbox" role="switch" className={`form-check-input ${estilos.interruptor}`} />
            {etiquetaOculta ? <span className="visually-hidden">{etiqueta}</span> : etiqueta}
        </label>
    );
}

export function Cantidad({
    valor,
    alCambiar,
    minimo = 1,
    maximo,
    etiqueta = 'Cantidad',
    disabled = false,
}: {
    valor: number;
    alCambiar: (valor: number) => void;
    minimo?: number;
    maximo?: number | undefined;
    etiqueta?: string;
    disabled?: boolean;
}) {
    return (
        <div role="group" aria-label={etiqueta} className={estilos.cantidad}>
            <button
                type="button"
                aria-label={`Reducir ${etiqueta.toLowerCase()}`}
                disabled={disabled || valor <= minimo}
                onClick={() => {
                    alCambiar(valor - 1);
                }}
            >
                <Minus size={20} aria-hidden="true" />
            </button>
            <output aria-live="polite" className="numero">
                {valor}
            </output>
            <button
                type="button"
                aria-label={`Aumentar ${etiqueta.toLowerCase()}`}
                disabled={disabled || (maximo !== undefined && valor >= maximo)}
                onClick={() => {
                    alCambiar(valor + 1);
                }}
            >
                <Plus size={20} aria-hidden="true" />
            </button>
        </div>
    );
}

/** Filtro activo que se puede quitar. */
export function Chip({ etiqueta, alQuitar }: { etiqueta: string; alQuitar: () => void }) {
    return (
        <span className={estilos.chip}>
            {etiqueta}
            <button type="button" aria-label={`Quitar filtro ${etiqueta}`} onClick={alQuitar}>
                <X size={16} aria-hidden="true" />
            </button>
        </span>
    );
}
