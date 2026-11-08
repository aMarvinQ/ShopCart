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

// Algunas fechas de la API llegan en UTC sin indicarlo; sin la Z se leerían como hora local.
const instante = (iso: string) => new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);

/** Fecha y hora en Guatemala, como en los mockups: 2 nov 2026, 14:35 */
export const fechaHora = (iso: string): string => FECHA_Y_HORA.format(instante(iso)).replace(/\./g, '');

const DIA_EN_GUATEMALA = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Guatemala',
});
const MES_CORTO = new Intl.DateTimeFormat('es-GT', { month: 'short', timeZone: 'UTC' });

/** Día AAAA-MM-DD de Guatemala en que cae un instante de la API. */
export const diaDe = (iso: string): string => DIA_EN_GUATEMALA.format(instante(iso));

/** Último día incluido por un fin excluido: el fin de "hasta el 30" es el inicio del 31. */
export const ultimoDiaDe = (iso: string): string => DIA_EN_GUATEMALA.format(new Date(instante(iso).getTime() - 1));

const partesDia = (dia: string) => ({
    numero: Number(dia.slice(8)),
    mes: MES_CORTO.format(new Date(`${dia}T00:00:00Z`)).replace(/\./g, ''),
    anio: dia.slice(0, 4),
});

/** Rango de días, como en los mockups: 1–30 nov 2026 · 1 ene–28 feb 2027 */
export function rangoDias(primero: string, ultimo: string): string {
    const [a, b] = [partesDia(primero), partesDia(ultimo)];
    if (primero === ultimo) return `${String(b.numero)} ${b.mes} ${b.anio}`;
    if (a.anio !== b.anio) return `${String(a.numero)} ${a.mes} ${a.anio}–${String(b.numero)} ${b.mes} ${b.anio}`;
    if (a.mes !== b.mes) return `${String(a.numero)} ${a.mes}–${String(b.numero)} ${b.mes} ${b.anio}`;
    return `${String(a.numero)}–${String(b.numero)} ${b.mes} ${b.anio}`;
}

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

/** Rango para la API. Con las fechas al revés se ordenan: quien las escribió quiso ese rango, no un error. */
export function rangoParaApi(desde: string, hasta: string) {
    const [inicio, fin] = [leerDia(desde), leerDia(hasta)];
    const invertido = inicio !== null && fin !== null && inicio > fin;
    const primero = invertido ? fin : inicio;
    const ultimo = invertido ? inicio : fin;
    return {
        ...(primero && { fechaDesde: inicioDelDia(primero) }),
        ...(ultimo && { fechaHasta: finDelDia(ultimo) }),
    };
}
