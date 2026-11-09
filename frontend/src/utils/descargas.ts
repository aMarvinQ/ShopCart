/** Entrega un archivo al navegador como descarga y libera la memoria del enlace temporal. */
export function guardarArchivo(archivo: Blob, nombre: string): void {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    // Se libera después: la descarga ya tomó el archivo.
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);
}
