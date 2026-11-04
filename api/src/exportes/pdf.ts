import type { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';
import { esperarCliente, formatear, recorrer, type Columna, type Documento, type TipoColumna } from './documento.js';

/*
    PDF en flujo con pdfkit: cada página se envía al terminarla (sin bufferPages), así la memoria
    no crece con el número de páginas. Tablas con encabezado repetido en cada página, filas
    alternadas, números alineados a la derecha, texto largo recortado con "…" y "Página N" al pie.
    Las fuentes estándar (Helvetica, WinAnsi) incluyen tildes y ñ.
*/
const MARGEN = 40;
const ALTO_FILA = 18;
const COLOR_ENCABEZADO = '#1F4E79';
const NUMERICOS: TipoColumna[] = ['moneda', 'entero', 'porcentaje'];

type Pdf = PDFKit.PDFDocument;

function pie(doc: Pdf, pagina: number): void {
    // Escribir dentro del margen inferior sin que pdfkit abra otra página.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#666666')
        .text(`ShopCart · Página ${String(pagina)}`, MARGEN, doc.page.height - MARGEN + 12, {
            width: doc.page.width - 2 * MARGEN,
            align: 'center',
            lineBreak: false,
        });
    doc.page.margins.bottom = margenInferior;
    doc.fillColor('#000000');
}

function anchos(doc: Pdf, columnas: Columna[]): number[] {
    const disponible = doc.page.width - 2 * MARGEN;
    const pesos = columnas.map((c) => c.ancho ?? 12);
    const suma = pesos.reduce((a, b) => a + b, 0);
    return pesos.map((p) => (disponible * p) / suma);
}

function filaTabla(doc: Pdf, valores: string[], medidas: number[], tipos: TipoColumna[], y: number, fondo?: string) {
    // save/restore: el fondo no cambia el color del texto.
    if (fondo)
        doc.save()
            .rect(
                MARGEN,
                y,
                medidas.reduce((a, b) => a + b, 0),
                ALTO_FILA,
            )
            .fill(fondo)
            .restore();
    let x = MARGEN;
    valores.forEach((valor, i) => {
        const ancho = medidas[i] ?? 0;
        doc.text(valor, x + 3, y + 5, {
            width: ancho - 6,
            height: ALTO_FILA - 4,
            ellipsis: true,
            lineBreak: false,
            align: NUMERICOS.includes(tipos[i] ?? 'texto') ? 'right' : 'left',
        });
        x += ancho;
    });
}

function encabezadoTabla(doc: Pdf, columnas: Columna[], medidas: number[], y: number): void {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
    filaTabla(
        doc,
        columnas.map((c) => c.titulo),
        medidas,
        columnas.map((c) => c.tipo ?? 'texto'),
        y,
        COLOR_ENCABEZADO,
    );
    doc.fillColor('#000000').font('Helvetica');
}

const limiteInferior = (doc: Pdf) => doc.page.height - MARGEN - 10;

/** Escribe el documento en `destino`; resuelve cuando el PDF terminó de escribirse. */
export async function escribirPdf(
    documento: Documento,
    destino: Writable,
    cancelado: () => boolean = () => false,
): Promise<void> {
    const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: MARGEN, bottom: MARGEN, left: MARGEN, right: MARGEN },
        info: { Title: documento.titulo, Author: 'ShopCart', Subject: documento.subtitulo },
    });
    const terminado = new Promise<void>((resolver, rechazar) => {
        destino.once('finish', resolver);
        destino.once('close', resolver);
        destino.once('error', rechazar);
    });
    doc.pipe(destino);

    let pagina = 1;
    doc.on('pageAdded', () => {
        pagina += 1;
        pie(doc, pagina);
    });
    pie(doc, pagina);

    doc.font('Helvetica-Bold').fontSize(16).text(documento.titulo, MARGEN, MARGEN);
    doc.font('Helvetica').fontSize(9).fillColor('#444444').text(documento.subtitulo).fillColor('#000000');
    doc.moveDown();

    if (documento.indicadores?.length) {
        const columnas: Columna[] = [
            { titulo: 'Indicador', clave: 'etiqueta', ancho: 3 },
            { titulo: 'Valor', clave: 'valor', ancho: 2, tipo: 'moneda' },
        ];
        const medidas = anchos(doc, columnas).map((m) => m * 0.6);
        let y = doc.y;
        encabezadoTabla(doc, columnas, medidas, y);
        y += ALTO_FILA;
        doc.fontSize(8);
        documento.indicadores.forEach((indicador, i) => {
            filaTabla(
                doc,
                [indicador.etiqueta, formatear(indicador.valor, indicador.tipo)],
                medidas,
                ['texto', 'moneda'],
                y,
                i % 2 ? '#F2F2F2' : undefined,
            );
            doc.fillColor('#000000');
            y += ALTO_FILA;
        });
        doc.y = y + 12;
    }

    for (const seccion of documento.secciones) {
        if (cancelado()) break;
        if (doc.y + 3 * ALTO_FILA > limiteInferior(doc)) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(11).text(seccion.titulo, MARGEN, doc.y);
        doc.moveDown(0.3);
        const medidas = anchos(doc, seccion.columnas);
        const tipos = seccion.columnas.map((c) => c.tipo ?? 'texto');
        let y = doc.y;
        encabezadoTabla(doc, seccion.columnas, medidas, y);
        y += ALTO_FILA;
        let indice = 0;
        let vacia = true;
        for await (const fila of recorrer(seccion.filas)) {
            if (cancelado()) break;
            await esperarCliente(destino);
            vacia = false;
            if (y + ALTO_FILA > limiteInferior(doc)) {
                doc.addPage();
                y = MARGEN;
                encabezadoTabla(doc, seccion.columnas, medidas, y);
                y += ALTO_FILA;
            }
            doc.font('Helvetica').fontSize(8);
            const valores = seccion.columnas.map((c) => formatear(fila[c.clave], c.tipo));
            filaTabla(doc, valores, medidas, tipos, y, indice % 2 ? '#F2F2F2' : undefined);
            doc.fillColor('#000000');
            y += ALTO_FILA;
            indice += 1;
        }
        doc.font('Helvetica').fontSize(8);
        if (vacia) {
            doc.text('Sin datos en el periodo.', MARGEN, y + 4);
            y += ALTO_FILA;
        }
        const nota = seccion.nota?.();
        if (nota) {
            doc.text(nota, MARGEN, y + 4, { width: doc.page.width - 2 * MARGEN });
            y = doc.y;
        }
        doc.y = y + 14;
    }

    doc.end();
    await terminado;
}
