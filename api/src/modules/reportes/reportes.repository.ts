import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';
import type { FiltrosCarritos, FiltrosVentasPeriodo, Rango } from './reportes.schemas.js';

/*
    Reportes (solo administrador): la base define qué es venta una sola vez (vistas 051), así el
    resumen, los periodos, las categorías y el top 10 siempre suman lo mismo. Todo se agrega en
    SQL Server: a la API llegan pocas filas (a lo más 366 periodos o 10 productos), nunca los
    pedidos uno por uno. Son lecturas: se reintentan ante un deadlock.
*/
type Fila = Record<string, unknown>;
const LECTURA = { reintentable: true };

const actor = (idUsuario: number) => ({ IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario } });

/** Día AAAA-MM-DD como DATE (medianoche UTC: mssql envía la fecha sin desplazarla). */
const dia = (valor: string | undefined) => ({
    tipo: TipoSql.Date,
    valor: valor === undefined ? null : new Date(`${valor}T00:00:00Z`),
});
const rango = (r: { fechaDesde?: string | undefined; fechaHasta?: string | undefined }) => ({
    FechaDesde: dia(r.fechaDesde),
    FechaHasta: dia(r.fechaHasta),
});

/** Las columnas DATE llegan como Date a medianoche UTC: se entregan como AAAA-MM-DD. */
function conDias(fila: Fila, columnas: string[]): Fila {
    const copia = { ...fila };
    for (const columna of columnas) {
        const valor = copia[columna];
        if (valor instanceof Date) copia[columna] = valor.toISOString().slice(0, 10);
    }
    return copia;
}

export async function resumen(idUsuario: number, r: Rango): Promise<Fila> {
    const { filas } = await ejecutarProcedimiento('SP_Reportes_Resumen', { ...actor(idUsuario), ...rango(r) }, LECTURA);
    return conDias(filas[0] as Fila, ['fechaDesde', 'fechaHasta']);
}

export async function ventasPorPeriodo(idUsuario: number, f: FiltrosVentasPeriodo): Promise<Fila[]> {
    const { filas } = await ejecutarProcedimiento(
        'SP_Reportes_VentasPorPeriodo',
        { ...actor(idUsuario), Agrupacion: { tipo: TipoSql.VarChar(7), valor: f.agrupacion }, ...rango(f) },
        LECTURA,
    );
    return filas.map((fila) => conDias(fila, ['periodo', 'desde', 'hasta']));
}

export async function ventasPorCategoria(idUsuario: number, r: Rango): Promise<Fila[]> {
    return (
        await ejecutarProcedimiento('SP_Reportes_VentasPorCategoria', { ...actor(idUsuario), ...rango(r) }, LECTURA)
    ).filas;
}

export async function topProductos(idUsuario: number, r: Rango): Promise<Fila[]> {
    return (await ejecutarProcedimiento('SP_Reportes_TopProductos', { ...actor(idUsuario), ...rango(r) }, LECTURA))
        .filas;
}

export async function carritosAbandonados(
    idUsuario: number,
    f: FiltrosCarritos,
    pagina: number,
    tamanoPagina: number,
): Promise<{ filas: Fila[]; total: number }> {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Reportes_CarritosAbandonados',
        {
            ...actor(idUsuario),
            ...rango(f),
            Pagina: { tipo: TipoSql.Int, valor: pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: tamanoPagina },
        },
        { salidas: { TotalRegistros: TipoSql.Int }, ...LECTURA },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}
