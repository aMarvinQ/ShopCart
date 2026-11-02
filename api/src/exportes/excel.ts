import type { Writable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
    aFecha,
    aTexto,
    esVerdadero,
    horaGuatemala,
    recorrer,
    type Columna,
    type Documento,
    type TipoColumna,
} from './documento.js';

/*
    Excel en flujo (WorkbookWriter): cada fila se escribe y se libera al confirmarla, así un
    archivo de 10 000 filas no ocupa memoria proporcional a su tamaño. Una hoja por sección (y
    una de indicadores), encabezado fijo, filtro por columna y formato por tipo.

    Inyección de fórmulas: todo texto se escribe como celda de texto (nunca como fórmula), así
    un nombre de producto como "=HYPERLINK(...)" se muestra tal cual y no se ejecuta.
*/
const FORMATOS: Partial<Record<TipoColumna, string>> = {
    moneda: '"Q"#,##0.00',
    entero: '#,##0',
    porcentaje: '0.00" %"',
    dia: 'dd/mm/yyyy',
    fechaHora: 'dd/mm/yyyy hh:mm',
};

function celda(valor: unknown, tipo: TipoColumna = 'texto'): ExcelJS.CellValue {
    if (valor === null || valor === undefined) return null;
    switch (tipo) {
        case 'moneda':
        case 'entero':
        case 'porcentaje':
            return Number(valor);
        case 'dia':
            return new Date(`${aTexto(valor).slice(0, 10)}T00:00:00Z`);
        case 'fechaHora':
            return horaGuatemala(aFecha(valor));
        case 'booleano':
            return esVerdadero(valor) ? 'Sí' : 'No';
        default:
            // { richText } fuerza celda de texto aunque empiece con "=" (nunca fórmula).
            return { richText: [{ text: aTexto(valor) }] };
    }
}

/** Nombre de hoja válido en Excel: máximo 31 caracteres y sin : \ / ? * [ ]. */
const nombreHoja = (titulo: string) => titulo.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);

function columnasDe(columnas: Columna[]): Partial<ExcelJS.Column>[] {
    return columnas.map((c) => ({
        header: c.titulo,
        key: c.clave,
        width: c.ancho ?? Math.max(12, c.titulo.length + 2),
        style: FORMATOS[c.tipo ?? 'texto'] ? { numFmt: FORMATOS[c.tipo ?? 'texto'] } : {},
    }));
}

function encabezado(hoja: ExcelJS.Worksheet, columnas: number): void {
    const fila = hoja.getRow(1);
    fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas } };
    fila.commit();
}

/** Escribe el documento en `destino`; resuelve al terminar. `cancelado()` detiene la lectura. */
export async function escribirExcel(
    documento: Documento,
    destino: Writable,
    cancelado: () => boolean = () => false,
): Promise<void> {
    const libro = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: destino, useStyles: true, useSharedStrings: false });
    libro.creator = 'ShopCart';
    libro.created = new Date();

    if (documento.indicadores?.length) {
        const hoja = libro.addWorksheet('Indicadores', { views: [{ state: 'frozen', ySplit: 1 }] });
        hoja.columns = [
            { header: 'Indicador', key: 'etiqueta', width: 34 },
            { header: 'Valor', key: 'valor', width: 20 },
        ];
        encabezado(hoja, 2);
        for (const indicador of documento.indicadores) {
            const fila = hoja.addRow({ etiqueta: indicador.etiqueta, valor: celda(indicador.valor, indicador.tipo) });
            const formato = FORMATOS[indicador.tipo ?? 'texto'];
            if (formato) fila.getCell(2).numFmt = formato;
            fila.commit();
        }
        hoja.addRow([]).commit();
        hoja.addRow([documento.titulo]).commit();
        hoja.addRow([documento.subtitulo]).commit();
        hoja.commit();
    }

    for (const seccion of documento.secciones) {
        const hoja = libro.addWorksheet(nombreHoja(seccion.titulo), { views: [{ state: 'frozen', ySplit: 1 }] });
        hoja.columns = columnasDe(seccion.columnas);
        encabezado(hoja, seccion.columnas.length);
        for await (const fila of recorrer(seccion.filas)) {
            if (cancelado()) return;
            hoja.addRow(
                Object.fromEntries(seccion.columnas.map((c) => [c.clave, celda(fila[c.clave], c.tipo)])),
            ).commit();
        }
        const nota = seccion.nota?.();
        if (nota) {
            hoja.addRow([]).commit();
            hoja.addRow([nota]).commit();
        }
        hoja.commit();
    }
    await libro.commit();
}
