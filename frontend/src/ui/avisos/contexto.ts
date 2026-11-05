import { createContext, useContext } from 'react';
import type { TipoMensaje } from '../iconosMensaje';

export type TipoAviso = TipoMensaje;

export interface DatosAviso {
    tipo: TipoAviso;
    titulo: string;
    detalle?: string;
    /** Enlace dentro del aviso, como "Ver carrito". */
    accion?: { etiqueta: string; alElegir: () => void };
}

export type MostrarAviso = (aviso: DatosAviso) => void;

export const ContextoAvisos = createContext<MostrarAviso | null>(null);

export function useAvisos(): MostrarAviso {
    const mostrar = useContext(ContextoAvisos);
    if (!mostrar) throw new Error('useAvisos debe usarse dentro de ProveedorAvisos.');
    return mostrar;
}
