/* Días como texto AAAA-MM-DD, siempre en hora de Guatemala: comparar y ordenar no depende del navegador. */
const HOY_EN_GUATEMALA = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Guatemala',
});
const DIA_Y_MES = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const MES_Y_ANIO = new Intl.DateTimeFormat('es-GT', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const FECHA_COMPLETA = new Intl.DateTimeFormat('es-GT', { dateStyle: 'full', timeZone: 'UTC' });

const aFecha = (dia: string) => new Date(`${dia}T00:00:00Z`);
const aDia = (fecha: Date) => fecha.toISOString().slice(0, 10);

export const hoyGuatemala = (): string => HOY_EN_GUATEMALA.format(new Date());

export function sumarDias(dia: string, dias: number): string {
    const fecha = aFecha(dia);
    fecha.setUTCDate(fecha.getUTCDate() + dias);
    return aDia(fecha);
}

export const inicioDeMes = (dia: string): string => `${dia.slice(0, 7)}-01`;

export function sumarMeses(primeroDeMes: string, meses: number): string {
    const fecha = aFecha(primeroDeMes);
    fecha.setUTCMonth(fecha.getUTCMonth() + meses);
    return aDia(fecha);
}

export const nombreDeMes = (primeroDeMes: string): string => MES_Y_ANIO.format(aFecha(primeroDeMes));
export const nombreDeDia = (dia: string): string => FECHA_COMPLETA.format(aFecha(dia));
const diaYMes = (dia: string) => DIA_Y_MES.format(aFecha(dia)).replace(/\./g, '');

/** Semanas de un mes, de lunes a domingo; null en los huecos antes del día 1 y después del último. */
export function semanasDelMes(primeroDeMes: string): (string | null)[][] {
    const huecosIniciales = (aFecha(primeroDeMes).getUTCDay() + 6) % 7;
    const celdas: (string | null)[] = Array.from({ length: huecosIniciales }, () => null);
    for (let dia = primeroDeMes; dia.slice(0, 7) === primeroDeMes.slice(0, 7); dia = sumarDias(dia, 1))
        celdas.push(dia);
    while (celdas.length % 7 !== 0) celdas.push(null);
    return Array.from({ length: celdas.length / 7 }, (_, i) => celdas.slice(i * 7, i * 7 + 7));
}

/** "Hoy, 5 nov", "5 nov", "1 nov – 5 nov", "Desde 1 nov" o "Hasta 5 nov". */
export function textoRango(desde: string | null, hasta: string | null): string {
    if (desde && hasta) {
        if (desde !== hasta) return `${diaYMes(desde)} – ${diaYMes(hasta)}`;
        return desde === hoyGuatemala() ? `Hoy, ${diaYMes(desde)}` : diaYMes(desde);
    }
    if (desde) return `Desde ${diaYMes(desde)}`;
    return hasta ? `Hasta ${diaYMes(hasta)}` : '';
}
