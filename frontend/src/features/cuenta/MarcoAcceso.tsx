import type { ReactNode } from 'react';
import { Tarjeta } from '../../ui/Navegacion';
import estilos from './cuenta.module.scss';

/** Tarjeta centrada de ingreso y registro. */
export function MarcoAcceso({
    titulo,
    subtitulo,
    pie,
    children,
}: {
    titulo: string;
    subtitulo: string;
    pie: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className={estilos.acceso}>
            <title>{`${titulo} · ShopCart`}</title>
            <Tarjeta className={estilos.accesoTarjeta}>
                <h1 className={estilos.titulo}>{titulo}</h1>
                <p className={estilos.subtitulo}>{subtitulo}</p>
                {children}
            </Tarjeta>
            <p className={estilos.accesoPie}>{pie}</p>
        </section>
    );
}
