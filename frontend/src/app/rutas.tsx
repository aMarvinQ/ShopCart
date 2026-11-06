import type { RouteObject } from 'react-router';
import { MENU_PANEL, ROLES_CLIENTE, ROLES_PERSONAL, rolesDe } from '../sesion/permisos';
import { RutaProtegida } from '../sesion/RutaProtegida';
import { EsqueletoApp } from '../ui/Esqueleto';
import { EnConstruccion } from './paginas/EnConstruccion';
import { ErrorRuta } from './paginas/ErrorRuta';
import { NoEncontrada } from './paginas/NoEncontrada';
import { Raiz } from './Raiz';

/*
    Mapa de rutas. Cada layout y pantalla se carga aparte: quien visita la tienda no descarga el
    panel. Las pantallas aún no implementadas muestran EnConstruccion con su ruta y permisos ya
    activos. La tabla de permisos (sesion/permisos.ts) es la que decide los roles.
*/
const pendiente = (path: string | undefined, titulo: string): RouteObject =>
    path === undefined
        ? { index: true, element: <EnConstruccion titulo={titulo} /> }
        : { path, element: <EnConstruccion titulo={titulo} /> };

const carga = <T extends { default: React.ComponentType }>(importar: () => Promise<T>) => ({
    lazy: async () => ({ Component: (await importar()).default }),
});

const relativa = (ruta: string, base: string) => ruta.slice(base.length + 1);

/* Pantallas del panel ya implementadas; las demás siguen con EnConstruccion y sus permisos activos. */
const PANTALLAS_PANEL: Partial<Record<string, () => Promise<{ default: React.ComponentType }>>> = {
    '/panel/pedidos': () => import('../features/panel/pedidos/Pedidos'),
    '/panel/devoluciones': () => import('../features/panel/devoluciones/Devoluciones'),
};

function pantallaPanel(ruta: string, etiqueta: string): RouteObject {
    const importar = PANTALLAS_PANEL[ruta];
    const camino = ruta === '/panel' ? undefined : relativa(ruta, '/panel');
    if (!importar) return pendiente(camino, etiqueta);
    return camino === undefined ? { index: true, ...carga(importar) } : { path: camino, ...carga(importar) };
}

export const rutas: RouteObject[] = [
    {
        element: <Raiz />,
        errorElement: <ErrorRuta />,
        HydrateFallback: EsqueletoApp,
        children: [
            {
                ...carga(() => import('./layouts/LayoutTienda')),
                children: [
                    {
                        errorElement: <ErrorRuta />,
                        children: [
                            { index: true, ...carga(() => import('../features/tienda/Inicio')) },
                            { path: 'productos', ...carga(() => import('../features/tienda/Productos')) },
                            { path: 'productos/:slug', ...carga(() => import('../features/tienda/DetalleProducto')) },
                            { path: 'seguimiento/:token', ...carga(() => import('../features/pedidos/Seguimiento')) },
                            { path: 'registro', ...carga(() => import('../features/cuenta/Registro')) },
                            { path: 'ingresar', ...carga(() => import('../features/cuenta/Ingresar')) },
                            {
                                path: 'cuenta',
                                element: <RutaProtegida roles={ROLES_CLIENTE} />,
                                children: [
                                    {
                                        ...carga(() => import('./layouts/LayoutCuenta')),
                                        children: [
                                            {
                                                path: 'pedidos',
                                                ...carga(() => import('../features/pedidos/MisPedidos')),
                                            },
                                            {
                                                path: 'pedidos/:id',
                                                ...carga(() => import('../features/pedidos/MisPedidos')),
                                            },
                                            {
                                                path: 'direcciones',
                                                ...carga(() => import('../features/cuenta/Direcciones')),
                                            },
                                            { path: 'perfil', ...carga(() => import('../features/cuenta/Perfil')) },
                                        ],
                                    },
                                ],
                            },
                            { path: '*', element: <NoEncontrada /> },
                        ],
                    },
                ],
            },
            {
                ...carga(() => import('./layouts/LayoutCompra')),
                children: [
                    {
                        errorElement: <ErrorRuta />,
                        children: [
                            { path: 'carrito', ...carga(() => import('../features/carrito/Carrito')) },
                            { path: 'checkout', ...carga(() => import('../features/checkout/Checkout')) },
                            {
                                path: 'checkout/confirmacion',
                                ...carga(() => import('../features/checkout/Confirmacion')),
                            },
                        ],
                    },
                ],
            },
            {
                path: 'panel',
                element: <RutaProtegida roles={ROLES_PERSONAL} />,
                children: [
                    {
                        ...carga(() => import('./layouts/LayoutPanel')),
                        children: [
                            {
                                errorElement: <ErrorRuta />,
                                children: [
                                    ...MENU_PANEL.map(({ ruta, etiqueta }) => ({
                                        // Cada sección exige los roles de la tabla, aunque se escriba la URL a mano.
                                        element: <RutaProtegida roles={rolesDe(ruta)} />,
                                        children: [pantallaPanel(ruta, etiqueta)],
                                    })),
                                    { path: '*', element: <NoEncontrada /> },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
    },
];
