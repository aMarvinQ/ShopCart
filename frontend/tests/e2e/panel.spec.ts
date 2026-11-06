import { expect, test } from '@playwright/test';
import { ingresar, OPERADOR } from './apoyo';

/* Ciclo de un pedido en el panel. Mueve dinero e inventario, por eso se prueba contra la API real. */
test('el operador lleva un pedido a entregado, registra una devolución y aparece en el kardex', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'escritorio', 'El flujo es el mismo en móvil.');
    const motivo = `Devolución ${String(Date.now())}`;
    await ingresar(page, OPERADOR);
    await page.goto('/panel/pedidos?estado=PAGADO');
    await page.getByRole('button', { name: /^SC-/ }).first().click();

    await page.getByRole('button', { name: 'Pasar a preparación' }).click();
    await page.getByRole('button', { name: 'Marcar como enviado' }).click();
    await page.getByRole('button', { name: 'Marcar como entregado' }).click();

    await page.getByRole('button', { name: 'Registrar devolución' }).click();
    await page.getByRole('checkbox').first().check();
    await page.getByLabel('Motivo').fill(motivo);
    await page.getByRole('button', { name: 'Registrar devolución' }).click();
    await page.getByRole('button', { name: 'Sí, registrar' }).click();
    await expect(page.getByText('Devolución registrada')).toBeVisible();

    await page.goto('/panel/inventario?vista=kardex');
    await expect(page.getByText(motivo).first()).toBeVisible();
});
