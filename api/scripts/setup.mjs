/*
    Prepara el entorno de la API: copia las imágenes de la semilla (seed-assets/) a la carpeta
    de imágenes servidas (uploads/), que no se versiona. No sobrescribe: una imagen ya copiada
    o cambiada desde el panel se conserva.
*/
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origen = path.join(raiz, 'seed-assets', 'productos');
const destino = path.join(raiz, process.env.CARPETA_UPLOADS ?? 'uploads', 'productos');

await mkdir(destino, { recursive: true });
await cp(origen, destino, {
    recursive: true,
    force: false,
    errorOnExist: false,
    filter: (archivo) => !archivo.endsWith('.md'),
});
console.log(`Imágenes de la semilla disponibles en ${path.relative(raiz, destino)}.`);
