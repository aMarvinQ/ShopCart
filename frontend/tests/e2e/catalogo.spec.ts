import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ADMIN, ingresar } from './apoyo';

const IMAGEN = path.resolve(process.cwd(), '../api/seed-assets/productos/playera-basica.jpg');

/* Lo que el administrador da de alta es lo que ve el comprador. */
test('el administrador crea un producto con imagen, lo publica y aparece en la tienda', async ({ page }, info) => {
    test.skip(info.project.name !== 'escritorio', 'El flujo es el mismo en móvil.');
    const marca = String(Date.now());
    const nombre = `Producto de prueba ${marca}`;

    await ingresar(page, ADMIN);
    await page.goto('/panel/catalogo/productos/nuevo');
    await page.getByLabel('Nombre', { exact: true }).fill(nombre);
    await page.getByRole('combobox', { name: 'Categoría' }).click();
    await page.getByRole('option', { name: 'Bebidas', exact: true }).click();
    await page.getByLabel('Precio para todas').fill('12.50');
    await page.getByRole('textbox', { name: /^SKU de/ }).fill(`T-${marca}`);
    await page.getByRole('textbox', { name: /^Existencia inicial de/ }).fill('7');
    await page.locator('input[type=file]').setInputFiles(IMAGEN);
    await expect(page.getByLabel('Descripción', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Crear producto' }).click();

    await expect(page).toHaveURL(/\/panel\/catalogo\/productos\/\d+/);
    await page.getByRole('switch', { name: 'Visible en la tienda' }).click();
    await expect(page.getByText('Producto visible en la tienda')).toBeVisible();

    await page.goto(`/productos?texto=${marca}`);
    await page.getByRole('heading', { name: nombre }).getByRole('link').click();
    await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
    await expect(page.getByText('Q12.50').first()).toBeVisible();
});
