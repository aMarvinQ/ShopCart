/*
    Imágenes de los productos de la semilla de demostración (D58).

    La lista sale de database/seed/110_Seed_Demo.sql, la única fuente: cada fila de #DefImagen
    (producto, ruta, texto alternativo, color) es una imagen, y el color de fondo es el CodigoHex
    del valor en #DefValor. Así la base y los archivos no pueden desincronizarse.

    Uso:
      npm run imagenes:semilla     Crea las imágenes que falten (nunca sobrescribe: una foto real
                                   con el mismo nombre se conserva) y actualiza LISTA.md.
      npm run imagenes:verificar   Comprueba que estén todas, que no sobre ninguna y que cada una
                                   sea un JPEG cuadrado de hasta 300 KB. Termina con error si no.
*/
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const semilla = path.join(raiz, 'database', 'seed', '110_Seed_Demo.sql');
const carpeta = path.join(raiz, 'api', 'seed-assets', 'productos');
const PREFIJO_RUTA = '/uploads/productos/';
const LADO = 800;
const MAXIMO_BYTES = 300 * 1024;
const FONDO_GENERAL = '#E9ECEF';

const texto = (s) => s.replace(/''/g, "'");

async function leerSemilla() {
    const sql = await readFile(semilla, 'utf8');

    // (N'Color', N'Negro', '#1F1F1F', 1)
    const colores = new Map();
    for (const [, valor, hex] of sql.matchAll(/\(N'Color', N'((?:[^']|'')+)', '(#[0-9A-Fa-f]{6})', \d+\)/g)) {
        colores.set(texto(valor), hex);
    }

    // (N'playera-basica', N'/uploads/productos/playera-basica--negro.jpg', N'Playera básica negro', N'Negro')
    const imagenes = [];
    const fila =
        /\(N'([a-z0-9-]+)', N'(\/uploads\/productos\/[a-z0-9-]+\.jpg)', N'((?:[^']|'')+)', (?:N'((?:[^']|'')+)'|NULL)\)/g;
    for (const [, producto, ruta, alternativo, color] of sql.matchAll(fila)) {
        imagenes.push({
            producto,
            archivo: ruta.slice(PREFIJO_RUTA.length),
            alternativo: texto(alternativo),
            color: color ? texto(color) : null,
            fondo: color ? colores.get(texto(color)) : FONDO_GENERAL,
        });
    }
    if (imagenes.length === 0) throw new Error(`No se encontraron imágenes en ${semilla}.`);
    const sinColor = imagenes.filter((i) => !i.fondo);
    if (sinColor.length > 0) throw new Error(`Color sin CodigoHex: ${sinColor.map((i) => i.color).join(', ')}.`);
    return imagenes;
}

// Texto oscuro sobre fondos claros y claro sobre oscuros (luminancia relativa).
function colorTexto(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? '#212529' : '#FFFFFF';
}

const escaparXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Divide el nombre en líneas de hasta ~18 caracteres para que quepa en el cuadro.
function lineas(nombre) {
    const resultado = [];
    let actual = '';
    for (const palabra of nombre.split(' ')) {
        if (actual && (actual + ' ' + palabra).length > 18) {
            resultado.push(actual);
            actual = palabra;
        } else {
            actual = actual ? `${actual} ${palabra}` : palabra;
        }
    }
    if (actual) resultado.push(actual);
    return resultado;
}

async function crear(imagen, destino) {
    const tinta = colorTexto(imagen.fondo);
    const nombre = imagen.color ? imagen.alternativo.slice(0, -imagen.color.length - 1) : imagen.alternativo;
    const renglones = lineas(nombre);
    const alto = 64;
    const inicio = LADO / 2 - ((renglones.length - 1) * alto) / 2 - (imagen.color ? 30 : 0);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}">
  <rect width="100%" height="100%" fill="${imagen.fondo}"/>
  <rect x="40" y="40" width="${LADO - 80}" height="${LADO - 80}" rx="32" fill="none" stroke="${tinta}" stroke-opacity="0.25" stroke-width="4"/>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif" fill="${tinta}" text-anchor="middle">
    ${renglones.map((r, i) => `<text x="${LADO / 2}" y="${inicio + i * alto}" font-size="54" font-weight="600">${escaparXml(r)}</text>`).join('\n    ')}
    ${imagen.color ? `<text x="${LADO / 2}" y="${inicio + renglones.length * alto + 30}" font-size="40" fill-opacity="0.85">${escaparXml(imagen.color)}</text>` : ''}
    <text x="${LADO / 2}" y="${LADO - 80}" font-size="28" fill-opacity="0.6">ShopCart · imagen de demostración</text>
  </g>
</svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 82, mozjpeg: true }).toFile(destino);
}

async function escribirLista(imagenes) {
    // Conserva la fuente anotada a mano de cada archivo (última columna).
    const lista = path.join(carpeta, 'LISTA.md');
    const fuentes = new Map();
    if (existsSync(lista)) {
        for (const [, archivo, fuente] of (await readFile(lista, 'utf8')).matchAll(
            /^\| `([^`]+)` \|[^|]*\|[^|]*\| *(.*?) *\|$/gm,
        )) {
            fuentes.set(archivo, fuente);
        }
    }
    const filas = imagenes.map(
        (i) =>
            `| \`${i.archivo}\` | ${i.alternativo.replace(i.color ? ` ${i.color.toLowerCase()}` : '', '')} | ${i.color ?? 'General'} |${fuentes.get(i.archivo) ? ` ${fuentes.get(i.archivo)} ` : ' '}|`,
    );
    const contenido = `# Imágenes de la semilla de demostración

Generada por \`npm run imagenes:semilla\` a partir de \`database/seed/110_Seed_Demo.sql\`.

Para usar una foto real: reemplaza el archivo con **el mismo nombre**, en JPEG, cuadrado (~800 × 800)
y de hasta 300 KB; si es de un color, el producto debe ser de ese color. Anota la fuente en la última
columna. \`npm run imagenes:verificar\` comprueba nombres, formato y tamaño.

| Archivo | Producto | Color | Fuente |
|---|---|---|---|
${filas.join('\n')}
`;
    await writeFile(lista, contenido, 'utf8');
}

async function generar(imagenes) {
    await mkdir(carpeta, { recursive: true });
    let creadas = 0;
    for (const imagen of imagenes) {
        const destino = path.join(carpeta, imagen.archivo);
        if (existsSync(destino)) continue;
        await crear(imagen, destino);
        creadas += 1;
    }
    await escribirLista(imagenes);
    console.log(
        `${imagenes.length} imágenes en la semilla: ${creadas} creadas, ${imagenes.length - creadas} ya existían.`,
    );
}

async function verificar(imagenes) {
    const errores = [];
    const esperados = new Set(imagenes.map((i) => i.archivo));
    const presentes = existsSync(carpeta) ? (await readdir(carpeta)).filter((a) => a !== 'LISTA.md') : [];

    for (const archivo of esperados) {
        const ruta = path.join(carpeta, archivo);
        if (!existsSync(ruta)) {
            errores.push(`Falta ${archivo}.`);
            continue;
        }
        const { size } = await stat(ruta);
        if (size > MAXIMO_BYTES) errores.push(`${archivo} pesa ${Math.round(size / 1024)} KB (máximo 300 KB).`);
        try {
            const { format, width, height } = await sharp(ruta).metadata();
            if (format !== 'jpeg') errores.push(`${archivo} no es JPEG (es ${format}).`);
            if (width !== height) errores.push(`${archivo} no es cuadrada (${width} × ${height}).`);
        } catch {
            errores.push(`${archivo} no es una imagen válida.`);
        }
    }
    for (const archivo of presentes) {
        if (!esperados.has(archivo)) errores.push(`Sobra ${archivo}: no está en la semilla.`);
    }

    if (errores.length > 0) {
        console.error(errores.join('\n'));
        console.error(`${errores.length} problema(s) en ${carpeta}.`);
        process.exitCode = 1;
    } else {
        console.log(`OK: las ${imagenes.length} imágenes de la semilla existen y son JPEG cuadrados de hasta 300 KB.`);
    }
}

const imagenes = await leerSemilla();
await (process.argv.includes('--verificar') ? verificar(imagenes) : generar(imagenes));
