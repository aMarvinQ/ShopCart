import sql from 'mssql';
import { obtenerPool } from './conexion.js';
import { filaACamel, jsonACamel } from './nombres.js';
import type { NombreProcedimiento } from './procedimientos.js';

/*
    Único punto de la API que ejecuta algo en la base: solo stored procedures de la lista
    blanca, con parámetros tipados (nunca texto concatenado). Los repositorios de cada módulo
    son los únicos que lo llaman.
*/

/** Tipos de SQL Server para declarar los parámetros (los repositorios no importan mssql). */
export const TipoSql = sql;

type TipoParametro = sql.ISqlType | (() => sql.ISqlType);

export interface Parametro {
    tipo: TipoParametro;
    valor: unknown;
}

export interface OpcionesProcedimiento {
    /** Parámetros OUTPUT del SP, con su tipo. */
    salidas?: Record<string, TipoParametro>;
    /**
     * Reintentar una vez si SQL Server elige esta transacción como víctima de un deadlock
     * (1205). Solo para operaciones que se pueden repetir sin efecto doble (lecturas, o
     * escrituras protegidas por idempotencia en la base).
     */
    reintentable?: boolean;
    /** Columnas (en camelCase) que el SP devuelve como JSON (FOR JSON): se entregan como objetos. */
    json?: string[];
}

export interface ResultadoProcedimiento<T> {
    filas: T[];
    salidas: Record<string, unknown>;
}

const ERROR_DEADLOCK = 1205;

export function numeroErrorSql(error: unknown): number | undefined {
    if (typeof error === 'object' && error !== null && 'number' in error && typeof error.number === 'number') {
        return error.number;
    }
    return undefined;
}

function convertirFila(fila: Record<string, unknown>, json: string[] | undefined): Record<string, unknown> {
    const convertida = filaACamel(fila);
    for (const columna of json ?? []) {
        const valor = convertida[columna];
        if (typeof valor === 'string') convertida[columna] = jsonACamel(valor);
    }
    return convertida;
}

export interface ColumnaTabla {
    nombre: string;
    tipo: TipoParametro;
    nulo?: boolean;
}

/**
 * Parámetro con valor de tabla (TVP) de un tipo de la base (p. ej. dbo.TT_Catalogo_Variante):
 * varias filas en una sola llamada y una sola transacción. Las columnas van en el orden del tipo.
 */
export type ValorCelda = string | number | boolean | Date | Buffer | null;

export function tablaSql(tipo: string, columnas: ColumnaTabla[], filas: ValorCelda[][]): sql.Table {
    const tabla = new sql.Table(tipo);
    for (const columna of columnas)
        tabla.columns.add(columna.nombre, columna.tipo, { nullable: columna.nulo ?? false });
    for (const fila of filas) tabla.rows.add(...fila);
    return tabla;
}

export async function ejecutarProcedimiento<T = Record<string, unknown>>(
    nombre: NombreProcedimiento,
    parametros: Record<string, Parametro> = {},
    opciones: OpcionesProcedimiento = {},
): Promise<ResultadoProcedimiento<T>> {
    const intentos = opciones.reintentable ? 2 : 1;
    for (let intento = 1; ; intento += 1) {
        try {
            const pool = await obtenerPool();
            const solicitud = pool.request();
            for (const [nombreParametro, { tipo, valor }] of Object.entries(parametros)) {
                if (valor instanceof sql.Table) solicitud.input(nombreParametro, valor);
                else solicitud.input(nombreParametro, tipo, valor);
            }
            for (const [nombreSalida, tipo] of Object.entries(opciones.salidas ?? {})) {
                solicitud.output(nombreSalida, tipo);
            }
            const resultado = await solicitud.execute<Record<string, unknown>>(nombre);
            // Los tipos de mssql no lo reflejan, pero un SP sin SELECT no devuelve conjunto de resultados.
            // Las filas llegan con sus columnas en camelCase (ver nombres.ts).
            const filas =
                resultado.recordsets.length > 0
                    ? resultado.recordset.map((fila) => convertirFila(fila, opciones.json) as T)
                    : [];
            return { filas, salidas: resultado.output };
        } catch (error) {
            if (intento < intentos && numeroErrorSql(error) === ERROR_DEADLOCK) continue;
            throw error;
        }
    }
}
