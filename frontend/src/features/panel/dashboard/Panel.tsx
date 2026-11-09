import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Boton } from '../../../ui/Boton';
import { Esqueleto } from '../../../ui/Esqueleto';
import estilos from './dashboard.module.scss';

/** Tarjeta de una sección del dashboard: título, enlace opcional y su contenido. */
export function Panel({
    titulo,
    detalle,
    enlace,
    children,
    className,
}: {
    titulo: string;
    detalle?: ReactNode;
    enlace?: { a: string; texto: string };
    children: ReactNode;
    className?: string;
}) {
    return (
        <section className={`${estilos.panel} ${className ?? ''}`}>
            <header className={estilos.panelCabecera}>
                <h2>{titulo}</h2>
                {detalle && <span className={estilos.panelDetalle}>{detalle}</span>}
                {enlace && <Link to={enlace.a}>{enlace.texto}</Link>}
            </header>
            {children}
        </section>
    );
}

/*
    Carga y error de cada sección por separado: si una consulta falla, las demás siguen a la vista.
    El esqueleto mide lo mismo que el contenido final para que nada salte al llegar los datos.
    `vacio` devuelve el estado vacío, o null si hay datos que mostrar.
*/
export function Contenido<T>({
    consulta,
    alto,
    vacio,
    children,
}: {
    consulta: UseQueryResult<T>;
    alto: string;
    vacio?: (datos: T) => ReactNode;
    children: (datos: T) => ReactNode;
}) {
    if (consulta.isPending) {
        return (
            <div role="status" aria-label="Cargando">
                <Esqueleto alto={alto} radio="8px" />
            </div>
        );
    }
    if (consulta.isError) {
        return (
            <div className={estilos.errorPanel} role="alert" style={{ minHeight: alto }}>
                <p>No pudimos cargar esta sección.</p>
                <Boton variante="secundario" tamano="sm" onClick={() => void consulta.refetch()}>
                    Reintentar
                </Boton>
            </div>
        );
    }
    return vacio?.(consulta.data) ?? children(consulta.data);
}
