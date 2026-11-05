import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

export type TipoMensaje = 'exito' | 'aviso' | 'error' | 'informacion';

export const ICONO_MENSAJE: Record<TipoMensaje, LucideIcon> = {
    exito: CircleCheck,
    aviso: TriangleAlert,
    error: CircleAlert,
    informacion: Info,
};
