import { DialogoConfirmacion } from '../../../../ui/Mensajes';
import type { Producto } from './hooks/useEdicionProducto';
import { useImagenesProducto } from './hooks/useImagenesProducto';
import { PanelImagenes } from './PanelImagenes';

export function ImagenesProducto({ producto }: { producto: Producto }) {
    const galeria = useImagenesProducto(producto);
    return (
        <>
            <PanelImagenes panel={galeria.panel} />
            <DialogoConfirmacion
                mostrar={galeria.porEliminar !== null}
                titulo="¿Eliminar esta imagen?"
                textoConfirmar="Sí, eliminar"
                cargando={galeria.eliminando}
                alCancelar={galeria.desistir}
                alConfirmar={galeria.confirmarEliminar}
            >
                Se borra también el archivo y no se puede deshacer.
            </DialogoConfirmacion>
        </>
    );
}
