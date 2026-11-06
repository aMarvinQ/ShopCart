import { Info } from 'lucide-react';
import { Boton } from './Boton';
import estilos from './BarraCambios.module.scss';

/** Barra fija al pie cuando hay cambios sin guardar. Va dentro del formulario: su botón lo envía. */
export function BarraCambios({
    mensaje = 'Tienes cambios sin guardar',
    guardando,
    alDescartar,
}: {
    mensaje?: string;
    guardando: boolean;
    alDescartar: () => void;
}) {
    return (
        <div className={estilos.barra} role="status">
            <span className={estilos.mensaje}>
                <Info size={18} aria-hidden="true" />
                {mensaje}
            </span>
            <Boton variante="fantasma" className={estilos.descartar ?? ''} disabled={guardando} onClick={alDescartar}>
                Descartar
            </Boton>
            <Boton type="submit" variante="secundario" cargando={guardando}>
                Guardar cambios
            </Boton>
        </div>
    );
}
