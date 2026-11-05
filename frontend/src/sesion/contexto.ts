import { createContext, useContext } from 'react';
import type { UsuarioSesion } from './renovacion';

/**
 * - cargando: se está recuperando la sesión con la cookie (solo si este navegador tuvo una).
 * - anonimo: visitante o invitado.
 * - autenticado: hay usuario.
 * - sin-servicio: no se pudo comprobar la sesión por una falla pasajera; se ofrece reintentar.
 */
export type EstadoSesion = 'cargando' | 'anonimo' | 'autenticado' | 'sin-servicio';

export interface DatosIngreso {
    correo: string;
    contrasena: string;
}

export interface DatosRegistro extends DatosIngreso {
    nombre: string;
    apellido: string;
    telefono?: string;
}

export interface ValorSesion {
    estado: EstadoSesion;
    usuario: UsuarioSesion | null;
    /** true si la sesión terminó sola (venció o se revocó), para explicarlo en la pantalla de ingreso. */
    sesionVencida: boolean;
    iniciarSesion: (datos: DatosIngreso) => Promise<UsuarioSesion>;
    registrarse: (datos: DatosRegistro) => Promise<UsuarioSesion>;
    /** Refleja en la barra el nombre que el usuario acaba de cambiar en su perfil. */
    actualizarNombre: (nombre: string, apellido: string) => void;
    cerrarSesion: () => Promise<void>;
    reintentar: () => void;
}

export const ContextoSesion = createContext<ValorSesion | null>(null);

export function useSesion(): ValorSesion {
    const valor = useContext(ContextoSesion);
    if (!valor) throw new Error('useSesion debe usarse dentro de ProveedorSesion.');
    return valor;
}
