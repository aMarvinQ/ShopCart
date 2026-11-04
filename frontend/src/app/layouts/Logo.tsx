import { ShoppingCart } from 'lucide-react';
import { Link } from 'react-router';
import estilos from './layouts.module.scss';

export function Logo({ a = '/', soloIcono = false }: { a?: string; soloIcono?: boolean }) {
    return (
        <Link to={a} className={estilos.logo} aria-label="ShopCart, ir al inicio">
            <span className={estilos.logoIcono}>
                <ShoppingCart size={18} aria-hidden="true" />
            </span>
            {!soloIcono && <span>ShopCart</span>}
        </Link>
    );
}
