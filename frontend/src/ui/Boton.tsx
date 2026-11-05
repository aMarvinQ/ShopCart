import type { LucideIcon } from 'lucide-react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import estilos from './Boton.module.scss';

export type VarianteBoton = 'primario' | 'secundario' | 'acento' | 'peligro' | 'fantasma' | 'enlace';
export type TamanoBoton = 'sm' | 'md' | 'lg';

interface Apariencia {
    variante?: VarianteBoton;
    tamano?: TamanoBoton;
    icono?: LucideIcon | undefined;
    iconoDerecha?: LucideIcon | undefined;
    anchoCompleto?: boolean;
}

/** Con texto, o solo icono: en ese caso la etiqueta para lectores de pantalla es obligatoria. */
type Contenido = { children: ReactNode } | { children?: undefined; icono: LucideIcon; 'aria-label': string };

function clasesDe(
    { variante = 'primario', tamano = 'md', anchoCompleto = false }: Apariencia,
    soloIcono: boolean,
    extra: string | undefined,
) {
    return [
        estilos.boton,
        estilos[variante],
        estilos[tamano],
        soloIcono && estilos.soloIcono,
        anchoCompleto && estilos.anchoCompleto,
        extra,
    ]
        .filter(Boolean)
        .join(' ');
}

function Interior({ icono: Icono, iconoDerecha: IconoDerecha, children }: Apariencia & { children: ReactNode }) {
    return (
        <>
            {Icono && <Icono size={20} aria-hidden="true" />}
            {children !== undefined && <span>{children}</span>}
            {IconoDerecha && <IconoDerecha size={20} aria-hidden="true" />}
        </>
    );
}

export type PropsBoton = Apariencia &
    Contenido &
    Omit<ComponentProps<'button'>, 'children'> & {
        /** Muestra tres puntos, conserva el ancho y bloquea el clic (también el envío con Enter). */
        cargando?: boolean;
    };

export function Boton({
    variante,
    tamano,
    icono,
    iconoDerecha,
    anchoCompleto,
    cargando = false,
    className,
    type = 'button',
    onClick,
    children,
    ...resto
}: PropsBoton) {
    const apariencia = {
        ...(variante && { variante }),
        ...(tamano && { tamano }),
        ...(anchoCompleto !== undefined && { anchoCompleto }),
    };
    const alHacerClic = (evento: MouseEvent<HTMLButtonElement>) => {
        if (cargando) {
            evento.preventDefault();
            return;
        }
        onClick?.(evento);
    };
    return (
        <button
            {...resto}
            type={type}
            onClick={alHacerClic}
            aria-busy={cargando || undefined}
            className={clasesDe(
                apariencia,
                children === undefined,
                `${cargando ? estilos.cargando : ''} ${className ?? ''}`,
            )}
        >
            <Interior icono={icono} iconoDerecha={iconoDerecha}>
                {children}
            </Interior>
            {cargando && (
                <span className={estilos.puntos} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                </span>
            )}
        </button>
    );
}

/** Navegación con el aspecto de un botón: es un enlace de verdad (abrir en otra pestaña, etc.). */
export function BotonEnlace({
    variante,
    tamano,
    icono,
    iconoDerecha,
    anchoCompleto,
    className,
    children,
    ...resto
}: Apariencia & LinkProps) {
    const apariencia = {
        ...(variante && { variante }),
        ...(tamano && { tamano }),
        ...(anchoCompleto !== undefined && { anchoCompleto }),
    };
    return (
        <Link {...resto} className={clasesDe(apariencia, false, typeof className === 'string' ? className : undefined)}>
            <Interior icono={icono} iconoDerecha={iconoDerecha}>
                {children}
            </Interior>
        </Link>
    );
}
