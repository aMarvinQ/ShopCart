import { LogOut } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';
import { Link } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { MENU_CUENTA, MENU_PANEL, menuPara, NOMBRE_ROL } from '../../sesion/permisos';
import { useCerrarSesion } from '../../sesion/useCerrarSesion';
import estilos from './layouts.module.scss';

/** Menú del usuario: sus secciones según el rol y cerrar sesión. */
export function MenuUsuario() {
    const { usuario } = useSesion();
    const salir = useCerrarSesion();
    if (!usuario) return null;

    const secciones = menuPara(MENU_CUENTA, usuario.codigoRol);
    const irAlPanel = menuPara(MENU_PANEL, usuario.codigoRol)[0];
    const nombreCompleto = `${usuario.nombre} ${usuario.apellido}`;
    const iniciales = `${usuario.nombre.charAt(0)}${usuario.apellido.charAt(0)}`.toUpperCase();

    return (
        <Dropdown align="end">
            <Dropdown.Toggle as="button" type="button" id="menu-usuario" bsPrefix={estilos.controlUsuario}>
                <span className={estilos.avatar}>{iniciales}</span>
                <span className={estilos.datosUsuario}>
                    <span className={estilos.nombreUsuario}>{nombreCompleto}</span>
                    {usuario.codigoRol !== 'CLIENTE' && (
                        <span className={estilos.rolUsuario}>{NOMBRE_ROL[usuario.codigoRol]}</span>
                    )}
                </span>
            </Dropdown.Toggle>
            <Dropdown.Menu>
                {secciones.map(({ ruta, etiqueta, icono: Icono }) => (
                    <Dropdown.Item as={Link} to={ruta} key={ruta}>
                        <Icono size={18} className="me-2" aria-hidden="true" />
                        {etiqueta}
                    </Dropdown.Item>
                ))}
                {irAlPanel && (
                    <Dropdown.Item as={Link} to={irAlPanel.ruta}>
                        <irAlPanel.icono size={18} className="me-2" aria-hidden="true" />
                        Panel
                    </Dropdown.Item>
                )}
                <Dropdown.Divider />
                <Dropdown.Item as="button" type="button" onClick={() => void salir()}>
                    <LogOut size={18} className="me-2" aria-hidden="true" />
                    Cerrar sesión
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
}
