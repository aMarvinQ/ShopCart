import { LogOut, UserRound } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { MENU_CUENTA, MENU_PANEL, menuPara } from '../../sesion/permisos';

/** Menú del usuario: sus secciones según el rol y cerrar sesión. */
export function MenuUsuario({ variante }: { variante: 'clara' | 'oscura' }) {
    const { usuario, cerrarSesion } = useSesion();
    const navegar = useNavigate();
    if (!usuario) return null;

    const salir = async () => {
        // Primero sale de la página: si no, la guarda de la ruta pediría ingresar de nuevo.
        await navegar('/');
        await cerrarSesion();
    };
    const secciones = menuPara(MENU_CUENTA, usuario.codigoRol);
    const irAlPanel = menuPara(MENU_PANEL, usuario.codigoRol)[0];

    return (
        <Dropdown align="end">
            <Dropdown.Toggle
                id="menu-usuario"
                variant="link"
                className={`text-decoration-none ${variante === 'oscura' ? 'text-white' : 'text-body'}`}
            >
                <UserRound size={20} className="me-1" aria-hidden="true" />
                <span className="d-none d-sm-inline">{usuario.nombre}</span>
                <span className="visually-hidden d-sm-none">Menú de {usuario.nombre}</span>
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
