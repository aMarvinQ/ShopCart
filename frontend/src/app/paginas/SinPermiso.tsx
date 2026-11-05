import { ShieldX } from 'lucide-react';
import { useSesion } from '../../sesion/contexto';
import { inicioDe } from '../../sesion/permisos';
import { BotonEnlace } from '../../ui/Boton';
import { EstadoVacio } from '../../ui/Mensajes';

/** 403: la sección existe, pero el rol del usuario no tiene acceso. */
export function SinPermiso() {
    const { usuario } = useSesion();
    return (
        <>
            <title>Sin permiso · ShopCart</title>
            <EstadoVacio
                nivel={1}
                icono={ShieldX}
                titulo="No tienes acceso a esta sección"
                mensaje="Si crees que es un error, pide acceso a un administrador."
                accion={
                    <BotonEnlace to={usuario ? inicioDe(usuario.codigoRol) : '/'} tamano="sm">
                        Ir al inicio
                    </BotonEnlace>
                }
            />
        </>
    );
}
