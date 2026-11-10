/** Teléfono de Guatemala: 8 dígitos, con o sin guion en medio (5555-1234). La misma regla de la API. */
export const PATRON_TELEFONO = /^\d{4}-?\d{4}$/;

export const MENSAJE_TELEFONO = 'Escribe los 8 dígitos, como 5555-1234.';

/**
 * Deja solo los dígitos, como máximo 8, con el guion después del cuarto: 55551234 → 5555-1234.
 * Si se pega con el código del país (+502 5555 1234), el 502 se descarta.
 */
export function formatearTelefono(texto: string): string {
    let digitos = texto.replace(/\D/g, '');
    if (digitos.length > 8 && digitos.startsWith('502')) digitos = digitos.slice(3);
    digitos = digitos.slice(0, 8);
    return digitos.length > 4 ? `${digitos.slice(0, 4)}-${digitos.slice(4)}` : digitos;
}
