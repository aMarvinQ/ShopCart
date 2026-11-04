import { QueryClient } from '@tanstack/react-query';
import { esErrorApi } from './errores';

/*
    Caché de datos del servidor.
    - Reintenta solo lecturas con fallas pasajeras; un 4xx no cambia por reintentar. Las
      modificaciones nunca se reintentan solas.
    - Lo que ninguna pantalla usa se borra a los 5 minutos: la memoria no crece con la navegación.
    - Al salir de una pantalla sus consultas se cancelan (cada una pasa su `signal` al cliente).
*/
export const MAXIMO_REINTENTOS = 2;

export function debeReintentar(intentos: number, error: unknown): boolean {
    if (intentos >= MAXIMO_REINTENTOS) return false;
    return esErrorApi(error) && error.esPasajero;
}

export function crearClienteConsultas(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                staleTime: 30_000,
                gcTime: 5 * 60_000,
                retry: debeReintentar,
                refetchOnWindowFocus: false,
            },
            mutations: { retry: false },
        },
    });
}
