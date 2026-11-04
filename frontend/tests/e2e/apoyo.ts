import { expect, type Page } from '@playwright/test';

/* Credenciales de la semilla de demostración. */
export const ADMIN = { correo: 'admin@shopcart.test', contrasena: 'Admin#2026' };
export const OPERADOR = { correo: 'operador@shopcart.test', contrasena: 'Operador#2026' };
export const CLIENTE = { correo: 'cliente@shopcart.test', contrasena: 'Cliente#2026' };

export async function escribirCredenciales(page: Page, { correo, contrasena }: { correo: string; contrasena: string }) {
    await page.getByLabel('Correo electrónico').fill(correo);
    await page.getByLabel('Contraseña').fill(contrasena);
    await page.getByRole('button', { name: 'Ingresar' }).click();
}

export async function ingresar(page: Page, credenciales: { correo: string; contrasena: string }) {
    await page.goto('/ingresar');
    await escribirCredenciales(page, credenciales);
    await expect(page).not.toHaveURL(/\/ingresar/);
}

export const anchoMovil = (page: Page) => (page.viewportSize()?.width ?? 1280) < 992;

/** En móvil el menú del panel está en un cajón: lo abre. Devuelve el menú visible. */
export async function menuPanel(page: Page) {
    if (anchoMovil(page)) await page.getByRole('button', { name: 'Abrir menú' }).click();
    const menu = page.getByRole('navigation', { name: 'Panel' }).filter({ visible: true });
    await expect(menu).toBeVisible();
    return menu;
}

/** Cierra sesión desde el menú del usuario. */
export async function salir(page: Page) {
    await page.locator('#menu-usuario').click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
}

/** Errores de la consola relacionados con la política de seguridad de contenido. */
export function vigilarCsp(page: Page): string[] {
    const violaciones: string[] = [];
    page.on('console', (mensaje) => {
        if (mensaje.type() === 'error' && /Content Security Policy/i.test(mensaje.text())) {
            violaciones.push(mensaje.text());
        }
    });
    return violaciones;
}
