import { ChevronsLeft, ChevronsRight, Menu } from 'lucide-react';
import { useState } from 'react';
import { Offcanvas } from 'react-bootstrap';
import { NavLink, Outlet } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { MENU_PANEL, menuPara, type EntradaMenu } from '../../sesion/permisos';
import { Logo } from './Logo';
import { MenuUsuario } from './MenuUsuario';
import estilos from './layouts.module.scss';

/* Panel interno: menú lateral contraíble en escritorio y cajón en móvil. El menú sale de la tabla de permisos. */
const CLAVE_CONTRAIDO = 'shopcart_menu_contraido';

function leerContraido(): boolean {
    try {
        return localStorage.getItem(CLAVE_CONTRAIDO) === '1';
    } catch {
        return false;
    }
}

function guardarContraido(valor: boolean): void {
    try {
        localStorage.setItem(CLAVE_CONTRAIDO, valor ? '1' : '0');
    } catch {
        /* preferencia sin guardar: no afecta el uso */
    }
}

function agrupar(entradas: EntradaMenu[]): [string | undefined, EntradaMenu[]][] {
    const grupos = new Map<string | undefined, EntradaMenu[]>();
    for (const entrada of entradas) grupos.set(entrada.grupo, [...(grupos.get(entrada.grupo) ?? []), entrada]);
    return [...grupos];
}

function MenuLateral({ contraido, alElegir }: { contraido: boolean; alElegir?: () => void }) {
    const { usuario } = useSesion();
    return (
        <nav aria-label="Panel" className={estilos.menu}>
            {agrupar(menuPara(MENU_PANEL, usuario?.codigoRol)).map(([grupo, entradas]) => (
                <div key={grupo ?? 'principal'}>
                    {grupo && !contraido && <div className={estilos.menuGrupo}>{grupo}</div>}
                    {grupo && contraido && <hr className={estilos.menuSeparador} />}
                    {entradas.map(({ ruta, etiqueta, icono: Icono }) => (
                        <NavLink
                            key={ruta}
                            to={ruta}
                            end={ruta === '/panel'}
                            onClick={alElegir}
                            title={contraido ? etiqueta : undefined}
                            aria-label={contraido ? etiqueta : undefined}
                            className={({ isActive }) =>
                                `${estilos.menuEnlace} ${isActive ? estilos.menuEnlaceActivo : ''}`
                            }
                        >
                            <Icono size={20} aria-hidden="true" />
                            {!contraido && <span>{etiqueta}</span>}
                        </NavLink>
                    ))}
                </div>
            ))}
        </nav>
    );
}

export default function LayoutPanel() {
    const [contraido, setContraido] = useState(leerContraido);
    const [cajonAbierto, setCajonAbierto] = useState(false);
    const alternar = () => {
        setContraido((actual) => {
            guardarContraido(!actual);
            return !actual;
        });
    };
    const Flecha = contraido ? ChevronsRight : ChevronsLeft;

    return (
        <div className={`${estilos.panel} ${contraido ? estilos.panelContraido : ''}`}>
            <a className="visually-hidden-focusable" href="#contenido">
                Saltar al contenido
            </a>
            <aside className={estilos.lateral}>
                <div className={estilos.lateralCabecera}>
                    <Logo a="/" soloIcono={contraido} />
                    <button
                        type="button"
                        className={estilos.botonIcono}
                        onClick={alternar}
                        aria-label={contraido ? 'Expandir menú' : 'Contraer menú'}
                        aria-expanded={!contraido}
                    >
                        <Flecha size={20} aria-hidden="true" />
                    </button>
                </div>
                <MenuLateral contraido={contraido} />
            </aside>

            <Offcanvas
                show={cajonAbierto}
                onHide={() => {
                    setCajonAbierto(false);
                }}
                className={estilos.cajon}
                aria-label="Menú del panel"
            >
                <Offcanvas.Header closeButton closeVariant="white">
                    <Logo a="/" />
                </Offcanvas.Header>
                <Offcanvas.Body>
                    <MenuLateral
                        contraido={false}
                        alElegir={() => {
                            setCajonAbierto(false);
                        }}
                    />
                </Offcanvas.Body>
            </Offcanvas>

            <div className={estilos.panelCuerpo}>
                <header className={estilos.panelBarra}>
                    <button
                        type="button"
                        className={`${estilos.botonIcono} ${estilos.soloMovil}`}
                        onClick={() => {
                            setCajonAbierto(true);
                        }}
                        aria-label="Abrir menú"
                    >
                        <Menu size={22} aria-hidden="true" />
                    </button>
                    <div className={estilos.espacio} />
                    <MenuUsuario variante="clara" />
                </header>
                <main id="contenido" className={estilos.panelContenido}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
