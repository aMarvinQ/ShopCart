/* Preferencia del menú lateral: la lee el panel y también su esqueleto, para cargar con el mismo ancho. */
const CLAVE = 'shopcart_menu_contraido';

export function leerContraido(): boolean {
    try {
        return localStorage.getItem(CLAVE) === '1';
    } catch {
        return false;
    }
}

export function guardarContraido(valor: boolean): void {
    try {
        localStorage.setItem(CLAVE, valor ? '1' : '0');
    } catch {
        /* preferencia sin guardar: no afecta el uso */
    }
}
