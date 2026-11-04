import { Navigate, Outlet, useLocation } from 'react-router';
import { SinPermiso } from '../app/paginas/SinPermiso';
import { useSesion } from './contexto';
import { puede, type Rol } from './permisos';

/**
 * Guarda de ruta: sin sesión lleva a ingresar y conserva a dónde iba; con un rol no permitido
 * muestra "sin permiso". Es experiencia de usuario: la API valida cada petición de todos modos.
 */
export function RutaProtegida({ roles }: { roles: readonly Rol[] }) {
    const { usuario } = useSesion();
    const { pathname, search } = useLocation();
    if (!usuario) {
        const volver = encodeURIComponent(pathname + search);
        return <Navigate to={`/ingresar?volver=${volver}`} replace />;
    }
    if (!puede(usuario.codigoRol, roles)) return <SinPermiso />;
    return <Outlet />;
}
