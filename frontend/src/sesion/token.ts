/*
    El access token vive SOLO en memoria: una variable de este módulo. Nunca en localStorage ni en
    sessionStorage, donde un script inyectado podría leerlo. Al recargar la página se pierde y se
    recupera con el refresh token, que está en una cookie httpOnly que JavaScript no puede leer.
*/
let token: string | null = null;

export const obtenerToken = (): string | null => token;

export const fijarToken = (nuevo: string | null): void => {
    token = nuevo;
};

/*
    Marca sin datos sensibles: "este navegador tuvo una sesión". Evita llamar a /auth/refresh en
    cada visita de quien nunca inició sesión: sería un 401 seguro que además gasta el límite de
    intentos de su IP.
*/
const CLAVE_MARCA = 'shopcart_con_sesion';

export function huboSesion(): boolean {
    try {
        return localStorage.getItem(CLAVE_MARCA) === '1';
    } catch {
        return false; // almacenamiento bloqueado por el navegador
    }
}

export function marcarSesion(activa: boolean): void {
    try {
        if (activa) localStorage.setItem(CLAVE_MARCA, '1');
        else localStorage.removeItem(CLAVE_MARCA);
    } catch {
        /* almacenamiento bloqueado: solo se pierde la optimización */
    }
}

/* Aviso de que la sesión terminó (renovación rechazada): lo escucha el proveedor de sesión. */
type Oyente = () => void;
const oyentes = new Set<Oyente>();

/** Devuelve la función que cancela la suscripción. */
export function alTerminarSesion(oyente: Oyente): () => void {
    oyentes.add(oyente);
    return () => {
        oyentes.delete(oyente);
    };
}

export function avisarSesionTerminada(): void {
    for (const oyente of oyentes) oyente();
}
