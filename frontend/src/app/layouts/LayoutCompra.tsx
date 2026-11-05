import { ChevronRight, Lock } from 'lucide-react';
import { Outlet, useLocation } from 'react-router';
import { Logo } from './Logo';
import estilos from './layouts.module.scss';

const PASOS = [
    { ruta: '/carrito', etiqueta: 'Carrito' },
    { ruta: '/checkout', etiqueta: 'Envío y pago' },
    { ruta: '/checkout/confirmacion', etiqueta: 'Confirmación' },
];

/* Carrito y checkout: sin menús que distraigan de pagar, con los pasos de la compra. */
export default function LayoutCompra() {
    const { pathname } = useLocation();
    return (
        <div className={estilos.pagina}>
            <a className="visually-hidden-focusable" href="#contenido">
                Saltar al contenido
            </a>
            <header className={estilos.barra}>
                <div className={estilos.barraInterior}>
                    <Logo />
                    <ol className={estilos.pasos} aria-label="Pasos de la compra">
                        {PASOS.map(({ ruta, etiqueta }, indice) => (
                            <li key={ruta} aria-current={pathname === ruta ? 'step' : undefined}>
                                {indice > 0 && <ChevronRight size={16} aria-hidden="true" />}
                                {indice + 1}. {etiqueta}
                            </li>
                        ))}
                    </ol>
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
            <footer className={estilos.pie}>
                <div className="container">
                    <small>© {new Date().getFullYear()} ShopCart Guatemala</small>
                </div>
            </footer>
        </div>
    );
}
