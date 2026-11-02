/*
    Modelo común de un documento exportable (D77): un título, indicadores opcionales y secciones
    con columnas tipadas. El mismo documento se escribe en Excel o en PDF, así los dos formatos
    muestran siempre los mismos datos.

    Las filas de una sección pueden ser un arreglo (reportes pequeños) o un iterador asíncrono
    que trae la base página por página (listas largas): el archivo se escribe a medida que
    llegan, sin cargar todo en memoria, y con un tope de filas.
*/
export type Fila = Record<string, unknown>;

export type TipoColumna = 'texto' | 'entero' | 'moneda' | 'porcentaje' | 'dia' | 'fechaHora' | 'booleano';

export interface Columna {
    titulo: string;
    clave: string;
    tipo?: TipoColumna;
    /** Ancho relativo (Excel: caracteres; PDF: proporción). */
    ancho?: number;
}

export interface Seccion {
    titulo: string;
    columnas: Columna[];
    filas: Fila[] | AsyncIterable<Fila>;
    /** Texto bajo la tabla (p. ej. "se muestran las primeras 10 000 de 12 345"). */
    nota?: () => string | undefined;
}

export interface Indicador {
    etiqueta: string;
    valor: unknown;
    tipo?: TipoColumna;
}

export interface Documento {
    titulo: string;
    subtitulo: string;
    indicadores?: Indicador[];
    secciones: Seccion[];
}

export const TOPE_FILAS = 10_000;

/* --- Formato para mostrar (PDF y nombres) ------------------------------------------------- */

const ZONA = 'America/Guatemala';
const moneda = new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' });
const entero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaHora = new Intl.DateTimeFormat('es-GT', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

/** Texto de cualquier valor de una fila (los objetos, p. ej. los JSON de la bitácora, como JSON). */
export function aTexto(valor: unknown): string {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'string') return valor;
    if (typeof valor === 'number' || typeof valor === 'boolean' || typeof valor === 'bigint') return String(valor);
    if (valor instanceof Date) return valor.toISOString();
    return JSON.stringify(valor);
}

export const aFecha = (valor: unknown): Date => (valor instanceof Date ? valor : new Date(aTexto(valor)));
export const esVerdadero = (valor: unknown): boolean => valor === true || valor === 1 || valor === '1';

/** Día AAAA-MM-DD como dd/mm/aaaa. */
const diaLegible = (valor: string) => valor.slice(0, 10).split('-').reverse().join('/');

export function formatear(valor: unknown, tipo: TipoColumna = 'texto'): string {
    if (valor === null || valor === undefined || valor === '') return '';
    switch (tipo) {
        case 'moneda':
            return moneda.format(Number(valor));
        case 'entero':
            return entero.format(Number(valor));
        case 'porcentaje':
            return `${decimal.format(Number(valor))} %`;
        case 'dia':
            return diaLegible(aTexto(valor));
        case 'fechaHora':
            return fechaHora.format(aFecha(valor));
        case 'booleano':
            return esVerdadero(valor) ? 'Sí' : 'No';
        default:
            return aTexto(valor);
    }
}

/**
 * Fecha y hora UTC convertida a la hora de Guatemala como "hora de pared" (Excel no guarda zona
 * horaria: muestra la fecha tal cual).
 */
export function horaGuatemala(valor: Date): Date {
    const partes = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: ZONA,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        })
            .formatToParts(valor)
            .map((p) => [p.type, p.value]),
    );
    return new Date(
        Date.UTC(
            Number(partes.year),
            Number(partes.month) - 1,
            Number(partes.day),
            Number(partes.hour),
            Number(partes.minute),
            Number(partes.second),
        ),
    );
}

/** Hoy en Guatemala, AAAA-MM-DD. */
export function hoyGuatemala(ahora = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(ahora);
}

/** Recorre una sección: arreglo o iterador asíncrono, hasta el tope. */
export async function* recorrer(filas: Fila[] | AsyncIterable<Fila>, tope = TOPE_FILAS): AsyncGenerator<Fila> {
    let cuenta = 0;
    for await (const fila of filas) {
        if (cuenta >= tope) return;
        cuenta += 1;
        yield fila;
    }
}

/**
 * Trae una lista paginada de la base página por página (100 filas cada vez) hasta el tope.
 * La primera página se pide antes de empezar el archivo, para que un filtro inválido responda
 * con su error JSON y no con un archivo cortado.
 */
export async function paginado(
    obtener: (pagina: number, tamano: number) => Promise<{ filas: Fila[]; total: number }>,
    tope = TOPE_FILAS,
): Promise<{ filas: AsyncIterable<Fila>; total: number; nota: () => string | undefined }> {
    const TAMANO = 100;
    const primera = await obtener(1, TAMANO);
    const total = primera.total;
    async function* todas(): AsyncGenerator<Fila> {
        let entregadas = 0;
        let pagina = 1;
        let lote = primera.filas;
        for (;;) {
            for (const fila of lote) {
                if (entregadas >= tope) return;
                entregadas += 1;
                yield fila;
            }
            if (lote.length < TAMANO || entregadas >= tope || entregadas >= total) return;
            pagina += 1;
            lote = (await obtener(pagina, TAMANO)).filas;
        }
    }
    return {
        filas: todas(),
        total,
        nota: () =>
            total > tope
                ? `Se muestran los primeros ${entero.format(tope)} de ${entero.format(total)} registros; usa filtros para acotar.`
                : undefined,
    };
}
