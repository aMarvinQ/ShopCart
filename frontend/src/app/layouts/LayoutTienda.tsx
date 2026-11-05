import { UserRound } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { BuscadorTienda, EnlaceCarrito, MenuCategorias } from './BarraTienda';
import { Logo } from './Logo';
import { MenuUsuario } from './MenuUsuario';
import estilos from './layouts.module.scss';

/* Estructura de la tienda: barra oscura, contenido y pie. */
export default function LayoutTienda() {
    const { usuario } = useSesion();
    return (
        <div className={estilos.pagina}>
            <a className="visually-hidden-focusable" href="#contenido">
                Saltar al contenido
            </a>
            <header className={estilos.barra}>
                <div className={estilos.barraTienda}>
                    <Logo />
                    <div className={estilos.barraBusqueda}>
                        <MenuCategorias />
                        <BuscadorTienda />
                    </div>
                    <div className={estilos.barraControles}>
                        <EnlaceCarrito />
                        {usuario ? (
                            <MenuUsuario />
                        ) : (
                            <Link className={estilos.controlUsuario} to="/ingresar">
                                <span className={estilos.avatarRanura}>
                                    <UserRound size={20} aria-hidden="true" />
                                </span>
                                <span className={estilos.datosUsuario}>
                                    <span className={estilos.ingresar}>Ingresar</span>
                                </span>
                            </Link>
                        )}
                    </div>
                </div>
            </header>
            <main id="contenido" className={`container ${estilos.contenido}`}>
                <Outlet />
            </main>
            <footer className={estilos.pie}>
                <div className={`container ${estilos.pieColumnas}`}>
                    <div>
                        <Logo />
                        <p>Compra en línea y recibe tu pedido en toda Guatemala.</p>
                    </div>
                    <nav aria-label="Mi cuenta">
                        <h2>Mi cuenta</h2>
                        <Link to="/cuenta/pedidos">Mis pedidos</Link>
                        <Link to="/cuenta/direcciones">Direcciones</Link>
                    </nav>
                    <small>© {new Date().getFullYear()} ShopCart Guatemala</small>
                </div>
            </footer>
        </div>
    );
}
