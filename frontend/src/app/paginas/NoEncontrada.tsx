import { SearchX } from 'lucide-react';
import { BotonEnlace } from '../../ui/Boton';
import { EstadoVacio } from '../../ui/Mensajes';

export function NoEncontrada() {
    return (
        <>
            <title>Página no encontrada · ShopCart</title>
            <EstadoVacio
                nivel={1}
                icono={SearchX}
                titulo="No encontramos esta página"
                mensaje="Puede que el enlace esté mal escrito o que la página ya no exista."
                accion={
                    <BotonEnlace to="/" tamano="sm">
                        Ir a la tienda
                    </BotonEnlace>
                }
            />
        </>
    );
}
