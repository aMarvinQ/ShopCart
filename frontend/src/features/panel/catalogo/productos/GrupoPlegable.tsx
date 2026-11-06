import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import estilos from './productos.module.scss';

/** Contenedor de un grupo de variantes (p. ej. un color) que se expande al tocar su cabecera. */
export function GrupoPlegable({
    titulo,
    detalle,
    aviso,
    abierto,
    alAlternar,
    children,
}: {
    titulo: string;
    detalle: string;
    aviso?: string | undefined;
    abierto: boolean;
    alAlternar: () => void;
    children: ReactNode;
}) {
    return (
        <section className={`card ${estilos.grupoVariantes}`}>
            <button type="button" className={estilos.cabeceraGrupo} aria-expanded={abierto} onClick={alAlternar}>
                <ChevronRight size={18} aria-hidden="true" />
                <strong>{titulo}</strong>
                <small className={estilos.detalle}>{detalle}</small>
                {aviso && <small className={estilos.errorFila}>{aviso}</small>}
            </button>
            {abierto && children}
        </section>
    );
}
