import { ShoppingCart, UserRound } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { Logo } from './Logo';
import { MenuUsuario } from './MenuUsuario';
import estilos from './layouts.module.scss';

/* Estructura de la tienda: barra oscura, contenido y pie. El buscador y las categorías llegan con la tienda. */
export default function LayoutTienda() {
    const { usuario } = useSesion();
    return (
        <div className={estilos.pagina}>
            <a className="visually-hidden-focusable" href="#contenido">
                Saltar al contenido
            </a>
            <header className={estilos.barra}>
                <div className={`container ${estilos.barraInterior}`}>
                    <Logo />
                    <div className={estilos.espacio} />
                    {usuario ? (
                        <MenuUsuario variante="oscura" />
                    ) : (
                        <Link className={estilos.enlaceBarra} to="/ingresar">
                            <UserRound size={20} aria-hidden="true" />
                            <span>Ingresar</span>
                        </Link>
                    )}
                    <Link className={estilos.enlaceBarra} to="/carrito" aria-label="Carrito">
                        <ShoppingCart size={20} aria-hidden="true" />
                    </Link>
                </div>
            </header>
            <main id="contenido" className={`container ${estilos.contenido}`}>
                <Outlet />
            </main>
            <footer className={estilos.pie}>
                <div className="container">© {new Date().getFullYear()} ShopCart Guatemala</div>
            </footer>
        </div>
    );
}
