/**
 * Valida la ruta a la que se vuelve después de iniciar sesión: solo rutas internas. Sin esto, un
 * enlace como /ingresar?volver=https://sitio-falso.com enviaría al usuario a otro sitio justo
 * después de escribir su contraseña (redirección abierta).
 */
export function rutaInternaSegura(ruta: string | null | undefined): string | null {
    if (!ruta?.startsWith('/')) return null;
    // "//otro.com" y "/\otro.com" son URLs de otro sitio para el navegador.
    if (ruta.startsWith('//') || ruta.startsWith('/\\')) return null;
    // eslint-disable-next-line no-control-regex -- justo lo que se rechaza: tabuladores y saltos de línea
    if (/[\u0000-\u001f\\]/.test(ruta)) return null;
    try {
        const base = 'https://shopcart.invalid';
        const url = new URL(ruta, base);
        if (url.origin !== base) return null;
        return url.pathname + url.search + url.hash;
    } catch {
        return null;
    }
}
