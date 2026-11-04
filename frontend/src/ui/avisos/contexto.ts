import { createContext, useContext } from 'react';

export type TipoAviso = 'exito' | 'error' | 'aviso' | 'informacion';

export interface DatosAviso {
    tipo: TipoAviso;
    titulo: string;
    detalle?: string;
}

export type MostrarAviso = (aviso: DatosAviso) => void;

export const ContextoAvisos = createContext<MostrarAviso | null>(null);

export function useAvisos(): MostrarAviso {
    const mostrar = useContext(ContextoAvisos);
    if (!mostrar) throw new Error('useAvisos debe usarse dentro de ProveedorAvisos.');
    return mostrar;
}
