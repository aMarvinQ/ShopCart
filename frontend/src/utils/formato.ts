const QUETZALES = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formato de moneda del proyecto: Q1,234.50 */
export const moneda = (valor: number): string => `Q${QUETZALES.format(valor)}`;

const FECHA_Y_HORA = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Guatemala',
});

/** Fecha y hora en Guatemala, como en los mockups: 2 nov 2026, 14:35 */
export const fechaHora = (iso: string): string =>
    // Algunas fechas de la API llegan en UTC sin indicarlo; sin la Z se leerían como hora local.
    FECHA_Y_HORA.format(new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)).replace(/\./g, '');

/** Minutos y segundos de una cuenta regresiva: 14:05 */
export function minutosYSegundos(segundos: number): string {
    const minutos = Math.floor(segundos / 60);
    return `${String(minutos)}:${String(segundos % 60).padStart(2, '0')}`;
}
