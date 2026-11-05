import { useNavigate } from 'react-router';
import { useSesion } from './contexto';

/** Primero sale de la página: si no, la guarda de la ruta pediría ingresar de nuevo. */
export function useCerrarSesion() {
    const { cerrarSesion } = useSesion();
    const navegar = useNavigate();
    return async () => {
        await navegar('/');
        await cerrarSesion();
    };
}
