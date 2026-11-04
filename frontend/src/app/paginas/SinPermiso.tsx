import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';
import { useSesion } from '../../sesion/contexto';
import { inicioDe } from '../../sesion/permisos';

/** 403: la sección existe, pero el rol del usuario no tiene acceso. */
export function SinPermiso() {
    const { usuario } = useSesion();
    return (
        <div className="text-center py-5">
            <title>Sin permiso · ShopCart</title>
            <ShieldX size={48} className="text-danger mb-3" aria-hidden="true" />
            <h1 className="h3">No tienes acceso a esta sección</h1>
            <p className="text-secondary">Si crees que es un error, pide acceso a un administrador.</p>
            <Link className="btn btn-primary" to={usuario ? inicioDe(usuario.codigoRol) : '/'}>
                Ir al inicio
            </Link>
        </div>
    );
}
