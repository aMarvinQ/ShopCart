import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import estilos from './layouts.module.scss';

export function Logo({
    a = '/',
    soloIcono = false,
    etiqueta,
}: {
    a?: string;
    soloIcono?: boolean;
    /** Texto junto a la marca, como "Panel". */
    etiqueta?: string;
}) {
    return (
        <Link
            to={a}
            className={estilos.logo}
            aria-label={`ShopCart${etiqueta && !soloIcono ? ` ${etiqueta}` : ''}, ir al inicio`}
        >
            <span className={estilos.logoIcono}>
                <ShoppingCart size={18} aria-hidden="true" />
            </span>
            {!soloIcono && <span>ShopCart</span>}
            {/* El espacio separa las palabras también para los lectores de pantalla. */}
            {!soloIcono && etiqueta && <span className={estilos.logoEtiqueta}> {etiqueta}</span>}
        </Link>
    );
}
