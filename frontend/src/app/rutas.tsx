import type { RouteObject } from 'react-router';
import { MENU_CUENTA, MENU_PANEL, ROLES_CLIENTE, ROLES_PERSONAL, rolesDe } from '../sesion/permisos';
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
const tituloDe = (ruta: string, menu: typeof MENU_PANEL) =>
    menu.find((entrada) => entrada.ruta === ruta)?.etiqueta ?? ruta;

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
                            pendiente(undefined, 'Tienda'),
                            pendiente('productos', 'Productos'),
                            pendiente('productos/:slug', 'Detalle de producto'),
                            pendiente('carrito', 'Carrito'),
                            pendiente('seguimiento/:token', 'Seguimiento del pedido'),
                            pendiente('registro', 'Crear cuenta'),
                            { path: 'ingresar', ...carga(() => import('../features/cuenta/Ingresar')) },
                            {
                                path: 'cuenta',
                                element: <RutaProtegida roles={ROLES_CLIENTE} />,
                                children: [
                                    {
                                        ...carga(() => import('./layouts/LayoutCuenta')),
                                        children: [
                                            pendiente('pedidos', tituloDe('/cuenta/pedidos', MENU_CUENTA)),
                                            pendiente('pedidos/:id', 'Detalle del pedido'),
                                            pendiente('direcciones', tituloDe('/cuenta/direcciones', MENU_CUENTA)),
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
                            pendiente('checkout', 'Envío y pago'),
                            pendiente('checkout/confirmacion', 'Confirmación'),
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
                                        children: [
                                            pendiente(
                                                ruta === '/panel' ? undefined : relativa(ruta, '/panel'),
                                                etiqueta,
                                            ),
                                        ],
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
