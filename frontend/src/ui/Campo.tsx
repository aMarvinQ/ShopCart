import { CircleAlert, Eye, EyeOff, Search, type LucideIcon } from 'lucide-react';
import { useId, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import { formatearTelefono } from '../utils/telefono';
import estilos from './Campo.module.scss';

export interface PropsMarcoCampo {
    etiqueta: string;
    ayuda?: string | undefined;
    error?: string | undefined;
    /** Para barras de filtros: la etiqueta solo la leen los lectores de pantalla y no hay línea de ayuda. */
    compacto?: boolean;
    ancho?: CSSProperties['width'];
}

/** Etiqueta arriba y, debajo, ayuda o error. La línea inferior se reserva: mostrar un error no mueve el resto. */
export function MarcoCampo({
    id,
    etiqueta,
    ayuda,
    error,
    compacto = false,
    ancho,
    children,
}: PropsMarcoCampo & { id: string; children: ReactNode }) {
    return (
        <div className={estilos.campo} style={ancho === undefined ? undefined : { width: ancho }}>
            <label htmlFor={id} id={`${id}-etiqueta`} className={compacto ? 'visually-hidden' : 'form-label mb-0'}>
                {etiqueta}
            </label>
            {children}
            {!compacto && (
                <div id={`${id}-pie`} className={`form-text ${estilos.pie}`}>
                    {error ? (
                        <span className={`invalid-feedback d-flex ${estilos.error}`}>
                            <CircleAlert size={16} aria-hidden="true" />
                            {error}
                        </span>
                    ) : (
                        ayuda
                    )}
                </div>
            )}
        </div>
    );
}

export type PropsCampo = PropsMarcoCampo &
    Omit<ComponentProps<'input'>, 'className' | 'style'> & {
        iconoInicio?: LucideIcon;
        adornoFin?: ReactNode;
    };

/** Campo de texto. Se conecta directo con React Hook Form: `<Campo {...register('correo')} />`. */
export function Campo({
    etiqueta,
    ayuda,
    error,
    compacto,
    ancho,
    id,
    iconoInicio: Icono,
    adornoFin,
    ...resto
}: PropsCampo) {
    const idGenerado = useId();
    const idCampo = id ?? idGenerado;
    const clases = [
        'form-control',
        error && 'is-invalid',
        error && estilos.controlError,
        Icono && estilos.conIcono,
        adornoFin && estilos.conAdorno,
    ];
    return (
        <MarcoCampo
            id={idCampo}
            etiqueta={etiqueta}
            ayuda={ayuda}
            error={error}
            {...(compacto !== undefined && { compacto })}
            {...(ancho !== undefined && { ancho })}
        >
            <div className={estilos.caja}>
                {Icono && <Icono size={20} className={estilos.icono} aria-hidden="true" />}
                <input
                    {...resto}
                    id={idCampo}
                    aria-invalid={Boolean(error)}
                    aria-describedby={compacto ? undefined : `${idCampo}-pie`}
                    className={clases.filter(Boolean).join(' ')}
                />
                {adornoFin}
            </div>
        </MarcoCampo>
    );
}

/** Texto de varias líneas, como un motivo o un comentario. */
export function AreaTexto({
    etiqueta,
    ayuda,
    error,
    filas = 3,
    ...resto
}: PropsMarcoCampo & Omit<ComponentProps<'textarea'>, 'className' | 'style' | 'rows' | 'id'> & { filas?: number }) {
    const id = useId();
    return (
        <MarcoCampo id={id} etiqueta={etiqueta} ayuda={ayuda} error={error}>
            <textarea
                {...resto}
                id={id}
                rows={filas}
                aria-invalid={Boolean(error)}
                aria-describedby={`${id}-pie`}
                className={['form-control', error && 'is-invalid', error && estilos.controlError]
                    .filter(Boolean)
                    .join(' ')}
            />
        </MarcoCampo>
    );
}

/** Botón dentro de un campo. No le quita el foco al campo al tocarlo. */
export function BotonAdorno({
    icono: Icono,
    etiqueta,
    ...resto
}: { icono: LucideIcon; etiqueta: string } & Omit<ComponentProps<'button'>, 'className' | 'type' | 'aria-label'>) {
    return (
        <button
            {...resto}
            type="button"
            className={estilos.adorno}
            aria-label={etiqueta}
            onMouseDown={(evento) => {
                evento.preventDefault();
            }}
        >
            <Icono size={20} aria-hidden="true" />
        </button>
    );
}

/**
    Teléfono de Guatemala: al escribir o pegar solo quedan los 8 dígitos, con el guion puesto (5555-1234).
    Funciona con React Hook Form: el valor se corrige antes de que el formulario lo lea.
*/
export function CampoTelefono({ onChange, ...props }: Omit<PropsCampo, 'type' | 'inputMode' | 'maxLength'>) {
    return (
        <Campo
            placeholder="5555-1234"
            autoComplete="tel-national"
            {...props}
            type="tel"
            inputMode="numeric"
            // Cabe un número pegado con código de país (+502 5555 1234); al escribir nunca pasa de 9.
            maxLength={14}
            onChange={(evento) => {
                evento.target.value = formatearTelefono(evento.target.value);
                onChange?.(evento);
            }}
        />
    );
}

export function CampoBusqueda(props: Omit<PropsCampo, 'iconoInicio' | 'type'>) {
    return <Campo {...props} type="search" iconoInicio={Search} />;
}

/** El botón alterna entre mostrar y ocultar sin borrar lo escrito. */
export function CampoContrasena(props: Omit<PropsCampo, 'iconoInicio' | 'adornoFin' | 'type'>) {
    const [visible, setVisible] = useState(false);
    const Icono = visible ? EyeOff : Eye;
    return (
        <Campo
            {...props}
            type={visible ? 'text' : 'password'}
            adornoFin={
                <BotonAdorno
                    icono={Icono}
                    etiqueta={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    aria-pressed={visible}
                    onClick={() => {
                        setVisible((actual) => !actual);
                    }}
                />
            }
        />
    );
}
