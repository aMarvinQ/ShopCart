import { LogOut } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { MENU_CUENTA, menuPara } from '../../sesion/permisos';
import { useCerrarSesion } from '../../sesion/useCerrarSesion';
import estilos from './layouts.module.scss';

/* Mi cuenta: menú lateral en escritorio, fila deslizable en móvil. */
export default function LayoutCuenta() {
    const { usuario } = useSesion();
    const salir = useCerrarSesion();
    return (
        <div className="row g-4">
            <div className="col-lg-3">
                <nav aria-label="Mi cuenta" className={estilos.cuentaMenu}>
                    {menuPara(MENU_CUENTA, usuario?.codigoRol).map(({ ruta, etiqueta, icono: Icono }) => (
                        <NavLink
                            key={ruta}
                            to={ruta}
                            className={({ isActive }) =>
                                `${estilos.cuentaEnlace} ${isActive ? estilos.cuentaEnlaceActivo : ''}`
                            }
                        >
                            <Icono size={18} aria-hidden="true" />
                            {etiqueta}
                        </NavLink>
                    ))}
                    <button type="button" className={estilos.cuentaEnlace} onClick={() => void salir()}>
                        <LogOut size={18} aria-hidden="true" />
                        Cerrar sesión
                    </button>
                </nav>
            </div>
            <div className="col-lg-9">
                <Outlet />
            </div>
        </div>
    );
}
