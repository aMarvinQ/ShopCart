import { Outlet, ScrollRestoration } from 'react-router';
import { AvisoConexion } from '../ui/AvisoConexion';

/* Lo común a todas las rutas: aviso de conexión y posición del scroll al navegar con Atrás. */
export function Raiz() {
    return (
        <>
            <AvisoConexion />
            <ScrollRestoration />
            <Outlet />
        </>
    );
}
