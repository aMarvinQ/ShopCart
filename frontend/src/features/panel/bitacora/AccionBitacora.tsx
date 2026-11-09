import { ArrowRightLeft, Pencil, Plus, Power, PowerOff } from 'lucide-react';
import { Insignia } from '../../../ui/Mensajes';
import { etiquetaAccion, type RegistroBitacora } from './hooks/useBitacora';

const ESTILO = {
    CREAR: { tono: 'exito', icono: Plus },
    MODIFICAR: { tono: 'neutro', icono: Pencil },
    ACTIVAR: { tono: 'informacion', icono: Power },
    DESACTIVAR: { tono: 'aviso', icono: PowerOff },
    CAMBIAR_ESTADO: { tono: 'informacion', icono: ArrowRightLeft },
} as const;

export function AccionBitacora({ accion }: { accion: RegistroBitacora['accion'] }) {
    const { tono, icono } = ESTILO[accion];
    return (
        <Insignia tono={tono} icono={icono}>
            {etiquetaAccion(accion)}
        </Insignia>
    );
}
