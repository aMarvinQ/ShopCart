import { expect, test } from '@playwright/test';
import { CLIENTE, escribirCredenciales, ingresar } from './apoyo';

/* Recorrido del visitante y del cliente, contra la API real. */
test.describe('tienda', () => {
    test('busca, filtra por URL, abre un producto, lo agrega y usa un cupón', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Recién llegados' })).toBeVisible();

        const buscador = page.getByRole('searchbox', { name: 'Buscar productos' });
        await buscador.fill('a');
        await buscador.press('Enter');
        await expect(page).toHaveURL(/\/productos\?texto=a/);
        await expect(page.getByRole('heading', { level: 1, name: /Resultados/ })).toBeVisible();
        await page.reload();
        await expect(buscador).toHaveValue('a');

        await page.getByRole('combobox', { name: 'Ordenar por' }).click();
        await page.getByRole('option', { name: 'Precio: menor a mayor' }).click();
        await expect(page).toHaveURL(/orden=precio-asc/);

        await page.getByRole('article').first().getByRole('heading').getByRole('link').click();
        await expect(page).toHaveURL(/\/productos\/.+/);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

        // Seis unidades alcanzan la compra mínima del cupón de abajo.
        await page.goto('/productos/playera-basica');
        for (let vuelta = 0; vuelta < 5; vuelta += 1) {
            await page.getByRole('button', { name: 'Aumentar cantidad' }).click();
        }
        await page.getByRole('button', { name: 'Agregar al carrito' }).filter({ visible: true }).first().click();
        await expect(page.getByText('Agregado al carrito')).toBeVisible();
        await page.getByRole('button', { name: 'Ver carrito' }).click();
        await expect(page).toHaveURL(/\/carrito$/);
        await expect(page.getByRole('heading', { level: 1, name: /Tu carrito/ })).toBeVisible();

        await page.getByLabel('Cupón de descuento').fill('NOEXISTE');
        await page.getByRole('button', { name: 'Aplicar' }).click();
        await expect(page.getByLabel('Cupón de descuento')).toHaveAttribute('aria-invalid', 'true');
        await page.getByLabel('Cupón de descuento').fill('DESCUENTO50');
        await page.getByRole('button', { name: 'Aplicar' }).click();
        await expect(page.getByRole('button', { name: 'Quitar cupón DESCUENTO50' })).toBeVisible();
    });

    test('al ingresar, el carrito de invitado se une al de la cuenta', async ({ page }) => {
        await page.goto('/productos');
        await page.getByRole('article').first().getByRole('heading').getByRole('link').click();
        await page.getByRole('button', { name: 'Agregar al carrito' }).filter({ visible: true }).first().click();
        await expect(page.getByText('Agregado al carrito')).toBeVisible();
        const nombre = await page.getByRole('heading', { level: 1 }).textContent();

        await page.goto('/ingresar?volver=%2Fcarrito');
        await escribirCredenciales(page, CLIENTE);
        await expect(page).toHaveURL(/\/carrito$/);
        await expect(page.getByRole('link', { name: nombre ?? '', exact: true })).toBeVisible();

        // Deja vacío el carrito de la cuenta de prueba: si no, las corridas llegarían al tope por producto.
        await page.getByRole('button', { name: 'Vaciar carrito' }).click();
        await page.getByRole('button', { name: 'Sí, vaciar' }).click();
        await expect(page.getByRole('heading', { name: 'Tu carrito está vacío' })).toBeVisible();
    });

    test('el cliente administra su libreta de direcciones', async ({ page }) => {
        const alias = `Prueba ${String(Date.now())}`;
        await ingresar(page, CLIENTE);
        await page.goto('/cuenta/direcciones');
        await page.getByRole('button', { name: 'Agregar dirección' }).click();
        await page.getByLabel('Nombre de la dirección').fill(alias);
        await page.getByLabel('Quién recibe').fill('María López');
        await page.getByLabel('Teléfono').fill('5555-1234');
        await page.getByLabel('Dirección', { exact: true }).fill('4a calle 5-20 zona 1');
        await page.getByRole('combobox', { name: 'Departamento' }).click();
        await page.getByRole('option').first().click();
        await page.getByRole('combobox', { name: 'Municipio' }).click();
        await page.getByRole('option').first().click();
        await page.getByRole('button', { name: 'Guardar dirección' }).click();
        const tarjeta = page.getByRole('listitem').filter({ hasText: alias });
        await expect(tarjeta).toBeVisible();

        await tarjeta.getByRole('button', { name: 'Eliminar' }).click();
        await page.getByRole('button', { name: 'Sí, eliminar' }).click();
        await expect(tarjeta).toHaveCount(0);
    });
});
