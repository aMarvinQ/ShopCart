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

const UN_DIA_MS = 86_400_000;
const inicioEnGuatemala = (dia: string) => new Date(`${dia}T00:00:00-06:00`).getTime();

/** Lee un día AAAA-MM-DD de la URL; si no es una fecha real, null. */
export function leerDia(valor: string): string | null {
    return /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(inicioEnGuatemala(valor)) ? valor : null;
}

/** Inicio de un día de Guatemala, en UTC como lo espera la API. Guatemala no cambia de horario. */
export const inicioDelDia = (dia: string): string => new Date(inicioEnGuatemala(dia)).toISOString();

/** Inicio del día siguiente: la API toma "hasta" como límite excluido. */
export const finDelDia = (dia: string): string => new Date(inicioEnGuatemala(dia) + UN_DIA_MS).toISOString();
