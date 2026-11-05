import { expect, test } from '@playwright/test';

/* Compra completa de un invitado: aquí se cobra dinero, así que se prueba contra la API real. */
test('el invitado compra: tarjeta rechazada, reintento y seguimiento sin sesión', async ({ page }) => {
    await page.goto('/productos/playera-basica');
    await page.getByRole('button', { name: 'Agregar al carrito' }).filter({ visible: true }).first().click();
    await expect(page.getByText('Agregado al carrito')).toBeVisible();
    await page.goto('/checkout');

    await page.getByLabel('Correo electrónico').fill('invitado@correo.com');
    await page.getByLabel('Quién recibe').fill('Ana Pérez');
    await page.getByLabel('Teléfono').fill('5555-1234');
    await page.getByLabel('Dirección', { exact: true }).fill('4a calle 5-20 zona 1');
    await page.getByRole('combobox', { name: 'Departamento' }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('combobox', { name: 'Municipio' }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Continuar al pago' }).click();

    await expect(page.getByRole('timer')).toBeVisible();

    const pagar = async (numero: string) => {
        await page.getByLabel('Número de tarjeta').fill(numero);
        await page.getByLabel('Nombre en la tarjeta').fill('ANA PEREZ');
        await page.getByLabel('Vencimiento').fill('12/30');
        await page.getByLabel('Código de seguridad').fill('123');
        await page.getByRole('button', { name: /^Pagar/ }).click();
    };

    await pagar('4000 0000 0000 0002');
    await expect(page.getByRole('alert').filter({ hasText: 'No se realizó el cobro' })).toBeVisible();
    await expect(page.getByLabel('Vencimiento')).toHaveValue('12/30');

    // Doble clic: dos clics seguidos solo envían un pago.
    let pagos = 0;
    page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().endsWith('/pago')) pagos += 1;
    });
    await page.getByLabel('Número de tarjeta').fill('4242 4242 4242 4242');
    await page.getByRole('button', { name: /^Pagar/ }).dblclick();

    await expect(page.getByRole('heading', { name: /Tu pedido está confirmado/ })).toBeVisible();
    expect(pagos).toBe(1);

    await page.getByRole('link', { name: 'Seguir mi pedido' }).click();
    await expect(page).toHaveURL(/\/seguimiento\//);
    await expect(page.getByRole('heading', { level: 1, name: /Pedido/ })).toBeVisible();
});
