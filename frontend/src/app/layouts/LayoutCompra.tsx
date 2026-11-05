import { ChevronRight, Lock } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { Logo } from './Logo';
import estilos from './layouts.module.scss';

/* Con `ruta`, un paso anterior se puede visitar; el de Pago depende de una reserva y no tiene enlace. */
const PASOS = [
    { etiqueta: 'Carrito', ruta: '/carrito' },
    { etiqueta: 'Envío', ruta: '/checkout' },
    { etiqueta: 'Pago' },
    { etiqueta: 'Confirmación' },
];
const PASO_CONFIRMACION = 3;

function pasoActual(pathname: string, search: string): number {
    if (pathname === '/carrito') return 0;
    if (pathname === '/checkout/confirmacion') return PASO_CONFIRMACION;
    return new URLSearchParams(search).has('id') ? 2 : 1;
}

/* Carrito y checkout: sin menús que distraigan de pagar, con los pasos de la compra. */
export default function LayoutCompra() {
    const { pathname, search } = useLocation();
    const actual = pasoActual(pathname, search);
    return (
        <div className={estilos.pagina}>
            <a className="visually-hidden-focusable" href="#contenido">
                Saltar al contenido
            </a>
            <header className={estilos.barra}>
                <div className={estilos.barraInterior}>
                    <Logo />
                    <ol className={estilos.pasos} aria-label="Pasos de la compra">
                        {PASOS.map(({ ruta, etiqueta }, indice) => {
                            const texto = `${String(indice + 1)}. ${etiqueta}`;
                            // Pagado el pedido ya no hay a dónde volver: el carrito se vació.
                            const conEnlace = ruta && indice < actual && actual < PASO_CONFIRMACION;
                            return (
                                <li key={etiqueta} aria-current={indice === actual ? 'step' : undefined}>
                                    {indice > 0 && <ChevronRight size={16} aria-hidden="true" />}
                                    {conEnlace ? <Link to={ruta}>{texto}</Link> : texto}
                                </li>
                            );
                        })}
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
