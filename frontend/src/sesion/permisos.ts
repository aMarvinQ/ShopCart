import {
    ClipboardList,
    LayoutDashboard,
    MapPin,
    Package,
    RotateCcw,
    ScrollText,
    Settings2,
    ShoppingBag,
    TicketPercent,
    Truck,
    UserRound,
    Users,
    Warehouse,
    type LucideIcon,
} from 'lucide-react';
import type { UsuarioSesion } from './renovacion';

export type Rol = UsuarioSesion['codigoRol'];

/*
    Única tabla de permisos del frontend: de aquí salen las guardas de las rutas y los menús, así
    no pueden contradecirse. Es para la experiencia del usuario: quien autoriza de verdad es la API
    (403) y cada stored procedure.
*/
export interface EntradaMenu {
    ruta: string;
    etiqueta: string;
    icono: LucideIcon;
    roles: readonly Rol[];
    grupo?: string;
}

const PERSONAL: readonly Rol[] = ['OPERADOR', 'ADMIN'];
const ADMIN: readonly Rol[] = ['ADMIN'];
const CLIENTE: readonly Rol[] = ['CLIENTE'];

export const MENU_PANEL: readonly EntradaMenu[] = [
    { ruta: '/panel', etiqueta: 'Dashboard', icono: LayoutDashboard, roles: ADMIN },
    { ruta: '/panel/pedidos', etiqueta: 'Pedidos', icono: ClipboardList, roles: PERSONAL, grupo: 'Operación' },
    { ruta: '/panel/devoluciones', etiqueta: 'Devoluciones', icono: RotateCcw, roles: PERSONAL, grupo: 'Operación' },
    { ruta: '/panel/inventario', etiqueta: 'Inventario', icono: Warehouse, roles: PERSONAL, grupo: 'Operación' },
    { ruta: '/panel/catalogo', etiqueta: 'Catálogo', icono: Package, roles: ADMIN, grupo: 'Administración' },
    { ruta: '/panel/cupones', etiqueta: 'Cupones', icono: TicketPercent, roles: ADMIN, grupo: 'Administración' },
    { ruta: '/panel/envios', etiqueta: 'Envíos', icono: Truck, roles: ADMIN, grupo: 'Administración' },
    { ruta: '/panel/usuarios', etiqueta: 'Usuarios', icono: Users, roles: ADMIN, grupo: 'Administración' },
    { ruta: '/panel/parametros', etiqueta: 'Parámetros', icono: Settings2, roles: ADMIN, grupo: 'Administración' },
    { ruta: '/panel/bitacora', etiqueta: 'Bitácora', icono: ScrollText, roles: ADMIN, grupo: 'Administración' },
];

export const MENU_CUENTA: readonly EntradaMenu[] = [
    { ruta: '/cuenta/pedidos', etiqueta: 'Mis pedidos', icono: ShoppingBag, roles: CLIENTE },
    { ruta: '/cuenta/direcciones', etiqueta: 'Direcciones', icono: MapPin, roles: CLIENTE },
    { ruta: '/cuenta/perfil', etiqueta: 'Perfil y contraseña', icono: UserRound, roles: CLIENTE },
];

export const ROLES_PERSONAL = PERSONAL;
export const ROLES_CLIENTE = CLIENTE;

export const puede = (rol: Rol | undefined, roles: readonly Rol[]): boolean => rol !== undefined && roles.includes(rol);

export const menuPara = (menu: readonly EntradaMenu[], rol: Rol | undefined): EntradaMenu[] =>
    menu.filter((entrada) => puede(rol, entrada.roles));

/** Roles de una ruta del panel, según la tabla. */
export function rolesDe(ruta: string): readonly Rol[] {
    const entrada = MENU_PANEL.find((e) => e.ruta === ruta);
    if (!entrada) throw new Error(`La ruta ${ruta} no está en la tabla de permisos.`);
    return entrada.roles;
}

/** A dónde va cada rol después de iniciar sesión, si no venía de ninguna página. */
export function inicioDe(rol: Rol): string {
    if (rol === 'ADMIN') return '/panel';
    if (rol === 'OPERADOR') return '/panel/pedidos';
    return '/';
}
