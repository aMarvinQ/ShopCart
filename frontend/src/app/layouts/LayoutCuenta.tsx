import { NavLink, Outlet } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { MENU_CUENTA, menuPara } from '../../sesion/permisos';
import estilos from './layouts.module.scss';

/* Mi cuenta: menú lateral en escritorio, fila deslizable en móvil. */
export default function LayoutCuenta() {
    const { usuario } = useSesion();
    return (
        <div className={estilos.cuenta}>
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
            </nav>
            <div className={estilos.cuentaContenido}>
                <Outlet />
            </div>
        </div>
    );
}
