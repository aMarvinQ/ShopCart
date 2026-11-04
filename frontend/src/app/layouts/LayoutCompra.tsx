import { Lock } from 'lucide-react';
import { Outlet } from 'react-router';
import { Logo } from './Logo';
import estilos from './layouts.module.scss';

/* Checkout: sin menús que distraigan de pagar. Los pasos se agregan con el checkout. */
export default function LayoutCompra() {
    return (
        <div className={estilos.pagina}>
            <a className="visually-hidden-focusable" href="#contenido">
                Saltar al contenido
            </a>
            <header className={estilos.barra}>
                <div className={`container ${estilos.barraInterior}`}>
                    <Logo />
                    <div className={estilos.espacio} />
                    <span className={estilos.compraSegura}>
                        <Lock size={16} aria-hidden="true" />
                        Compra segura
                    </span>
                </div>
            </header>
            <main id="contenido" className={`container ${estilos.contenido}`}>
                <Outlet />
            </main>
        </div>
    );
}
