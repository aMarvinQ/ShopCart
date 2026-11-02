import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { ErrorApi } from '../errors/ErrorApi.js';

/*
    Imágenes de productos en disco (D9), detrás de esta clase: cambiar a un almacenamiento en la
    nube (S3, Azure Blob) solo cambia esta implementación.
    - El tipo se identifica por el contenido (magic bytes), no por la extensión ni por el
      Content-Type que manda el cliente: ambos se pueden falsificar.
    - Se vuelve a codificar como WebP de hasta 1600 px: elimina metadatos (p. ej. la ubicación
      GPS de la cámara) y cualquier contenido extra escondido en el archivo original.
    - Nombre aleatorio: el cliente no elige rutas ni puede sobrescribir archivos.
*/
export const PREFIJO_RUTA = '/uploads/productos/';
const TIPOS_PERMITIDOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const LADO_MAXIMO = 1600;
const NOMBRE_SEGURO = /^[A-Za-z0-9-]+\.(webp|jpg|jpeg|png)$/;

export class AlmacenImagenes {
    private readonly carpeta: string;

    constructor(carpetaUploads: string) {
        this.carpeta = path.resolve(carpetaUploads, 'productos');
    }

    /** Valida, recodifica y guarda; devuelve la ruta pública (/uploads/productos/<uuid>.webp). */
    async guardar(contenido: Buffer, nombreOriginal: string): Promise<string> {
        const tipo = await fileTypeFromBuffer(contenido);
        if (!tipo || !TIPOS_PERMITIDOS.has(tipo.mime)) {
            throw new ErrorApi(
                400,
                'ARCHIVO_INVALIDO',
                `"${nombreOriginal}" no es una imagen JPEG, PNG o WebP (se revisa el contenido, no la extensión).`,
            );
        }
        let webp: Buffer;
        try {
            webp = await sharp(contenido, { limitInputPixels: 40_000_000 })
                .rotate() // respeta la orientación de la cámara antes de quitar los metadatos
                .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 85 })
                .toBuffer();
        } catch {
            throw new ErrorApi(400, 'ARCHIVO_INVALIDO', `"${nombreOriginal}" está dañado o es demasiado grande.`);
        }
        await mkdir(this.carpeta, { recursive: true });
        const nombre = `${randomUUID()}.webp`;
        await writeFile(path.join(this.carpeta, nombre), webp, { flag: 'wx' });
        return PREFIJO_RUTA + nombre;
    }

    /** Borra el archivo de una ruta pública; ignora rutas ajenas a la carpeta y archivos que ya no existen. */
    async eliminar(ruta: string): Promise<void> {
        const archivo = this.archivoDe(ruta);
        if (!archivo) return;
        try {
            await unlink(archivo);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
    }

    /** Rutas públicas de los archivos modificados antes de la fecha (candidatos a huérfanos). */
    async listarAnterioresA(fecha: Date): Promise<string[]> {
        let nombres: string[];
        try {
            nombres = await readdir(this.carpeta);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
            throw error;
        }
        const rutas: string[] = [];
        for (const nombre of nombres.filter((n) => NOMBRE_SEGURO.test(n))) {
            const { mtime, isFile } = await stat(path.join(this.carpeta, nombre)).then((s) => ({
                mtime: s.mtime,
                isFile: s.isFile(),
            }));
            if (isFile && mtime < fecha) rutas.push(PREFIJO_RUTA + nombre);
        }
        return rutas;
    }

    // Solo nombres simples dentro de la carpeta de productos: nunca "..", subcarpetas ni rutas absolutas.
    private archivoDe(ruta: string): string | null {
        if (!ruta.startsWith(PREFIJO_RUTA)) return null;
        const nombre = ruta.slice(PREFIJO_RUTA.length);
        return NOMBRE_SEGURO.test(nombre) ? path.join(this.carpeta, nombre) : null;
    }
}
