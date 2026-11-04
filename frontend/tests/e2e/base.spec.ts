import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { ADMIN, CLIENTE, escribirCredenciales, ingresar, menuPanel, OPERADOR, salir, vigilarCsp } from './apoyo';

test.describe('sesión', () => {
    test('quien nunca inició sesión no llama a renovar y entra como invitado', async ({ page }) => {
        const renovaciones: string[] = [];
        page.on('request', (r) => {
            if (r.url().includes('/auth/refresh')) renovaciones.push(r.url());
        });
        await page.goto('/');
        await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();
        expect(renovaciones).toEqual([]);
    });

    test('credenciales incorrectas muestran el mensaje; correo mal escrito, el error del campo', async ({ page }) => {
        await page.goto('/ingresar');
        await escribirCredenciales(page, { correo: 'no-es-correo', contrasena: 'x' });
        await expect(page.getByText('Escribe un correo válido.')).toBeVisible();
        await expect(page.getByLabel('Correo electrónico')).toHaveAttribute('aria-invalid', 'true');

        await escribirCredenciales(page, { correo: CLIENTE.correo, contrasena: 'Equivocada1' });
        await expect(page.getByRole('alert')).toBeVisible();
        await expect(page).toHaveURL(/\/ingresar/);
    });

    test('recargar conserva la sesión; el token no queda en el almacenamiento y la cookie es httpOnly', async ({
        page,
        context,
    }) => {
        await ingresar(page, CLIENTE);
        await page.goto('/cuenta/perfil');
        await expect(page.getByTestId('perfil-nombre')).toBeVisible();
        await page.reload();
        await expect(page.getByTestId('perfil-nombre')).toBeVisible();

        const almacenado = await page.evaluate(() =>
            JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]),
        );
        expect(almacenado).not.toContain('eyJ'); // así empieza todo JWT
        expect(almacenado).not.toMatch(/token/i);
        const refresh = (await context.cookies()).find((c) => c.name === 'shopcart_refresh');
        expect(refresh).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api/v1/auth' });
    });

    test('un token vencido se renueva sin que se note: una renovación y la pantalla carga', async ({ page }) => {
        await ingresar(page, CLIENTE);
        let vencer = true;
        let renovaciones = 0;
        page.on('request', (r) => {
            if (r.url().includes('/auth/refresh')) renovaciones += 1;
        });
        await page.route('**/api/v1/perfil', async (ruta) => {
            if (vencer) {
                vencer = false;
                await ruta.fulfill({
                    status: 401,
                    json: { error: { codigo: 'TOKEN_EXPIRADO', mensaje: 'Venció', requestId: 'e2e' } },
                });
                return;
            }
            await ruta.continue();
        });
        await page.locator('#menu-usuario').click();
        await page.getByRole('link', { name: 'Perfil y contraseña' }).click();
        await expect(page.getByTestId('perfil-nombre')).toBeVisible();
        expect(renovaciones).toBe(1);
        await expect(page).toHaveURL(/\/cuenta\/perfil/);
    });

    test('si la sesión terminó de verdad, pide ingresar, lo explica y vuelve a donde estaba', async ({ page }) => {
        await ingresar(page, CLIENTE);
        await page.route('**/api/v1/perfil', (ruta) =>
            ruta.fulfill({
                status: 401,
                json: { error: { codigo: 'TOKEN_EXPIRADO', mensaje: 'Venció', requestId: 'e2e' } },
            }),
        );
        await page.route('**/api/v1/auth/refresh', (ruta) =>
            ruta.fulfill({
                status: 401,
                json: { error: { codigo: 'SESION_EXPIRADA', mensaje: 'Venció', requestId: 'e2e' } },
            }),
        );
        await page.locator('#menu-usuario').click();
        await page.getByRole('link', { name: 'Perfil y contraseña' }).click();
        await expect(page).toHaveURL(/\/ingresar\?volver=%2Fcuenta%2Fperfil/);
        await expect(page.getByText('Tu sesión terminó; ingresa de nuevo.')).toBeVisible();

        await page.unroute('**/api/v1/perfil');
        await page.unroute('**/api/v1/auth/refresh');
        await escribirCredenciales(page, CLIENTE);
        await expect(page).toHaveURL(/\/cuenta\/perfil/);
    });

    test('cerrar sesión limpia todo: las rutas protegidas vuelven a pedir ingresar', async ({ page, context }) => {
        await ingresar(page, CLIENTE);
        await salir(page);
        await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();
        expect((await context.cookies()).find((c) => c.name === 'shopcart_refresh')).toBeUndefined();
        expect(await page.evaluate(() => localStorage.getItem('shopcart_con_sesion'))).toBeNull();
        await page.goto('/cuenta/perfil');
        await expect(page).toHaveURL(/\/ingresar/);
    });

    test('cerrar sesión en una pestaña también la cierra en la otra', async ({ page, context }) => {
        await ingresar(page, CLIENTE);
        await page.goto('/cuenta/perfil');
        await expect(page.getByTestId('perfil-nombre')).toBeVisible();
        const otra = await context.newPage();
        await otra.goto('/');
        await salir(otra);
        await expect(page).toHaveURL(/\/ingresar/);
        await otra.close();
    });

    test('dos pestañas que recargan a la vez conservan la sesión', async ({ page, context }) => {
        await ingresar(page, CLIENTE);
        const otra = await context.newPage();
        await page.goto('/cuenta/perfil');
        await otra.goto('/cuenta/perfil');
        await Promise.all([page.reload(), otra.reload()]);
        await expect(page.getByTestId('perfil-nombre')).toBeVisible();
        await expect(otra.getByTestId('perfil-nombre')).toBeVisible();
        await otra.close();
    });
});

test.describe('rutas y menús por rol', () => {
    test('sin sesión lleva a ingresar y, al entrar, vuelve a la página pedida', async ({ page }) => {
        await page.goto('/panel/inventario');
        await expect(page).toHaveURL(/\/ingresar\?volver=%2Fpanel%2Finventario/);
        await escribirCredenciales(page, OPERADOR);
        await expect(page).toHaveURL(/\/panel\/inventario/);
    });

    test('un volver a otro sitio se ignora (redirección abierta)', async ({ page }) => {
        await page.goto('/ingresar?volver=https%3A%2F%2Fsitio-falso.test');
        await escribirCredenciales(page, CLIENTE);
        await expect(page).toHaveURL(/localhost:4174\/$/);
    });

    test('operador: entra a pedidos, ve solo la operación y el resto da sin permiso', async ({ page }) => {
        await ingresar(page, OPERADOR);
        await expect(page).toHaveURL(/\/panel\/pedidos$/);
        const menu = await menuPanel(page);
        await expect(menu.getByRole('link')).toHaveText(['Pedidos', 'Devoluciones', 'Inventario']);
        await page.goto('/panel/usuarios');
        await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible();
        await page.goto('/panel');
        await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible();
    });

    test('administrador: entra al dashboard y ve las 10 secciones', async ({ page }) => {
        await ingresar(page, ADMIN);
        await expect(page).toHaveURL(/\/panel$/);
        const menu = await menuPanel(page);
        await expect(menu.getByRole('link')).toHaveCount(10);
        await menu.getByRole('link', { name: 'Bitácora' }).click();
        await expect(page).toHaveURL(/\/panel\/bitacora/);
        await expect(page.getByRole('heading', { name: 'Bitácora' })).toBeVisible();
    });

    test('cliente: no entra al panel; el personal no entra a la cuenta', async ({ page }) => {
        await ingresar(page, CLIENTE);
        await page.goto('/panel/pedidos');
        await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible();
        await page.goto('/');
        await salir(page);
        await ingresar(page, OPERADOR);
        await page.goto('/cuenta/pedidos');
        await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible();
    });

    test('una ruta inexistente muestra la página 404 dentro del layout', async ({ page }) => {
        await page.goto('/no-existe');
        await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'ShopCart, ir al inicio' })).toBeVisible();
    });

    test('el menú contraído se recuerda (solo escritorio)', async ({ page, isMobile }) => {
        test.skip(isMobile, 'En móvil el menú es un cajón.');
        await ingresar(page, ADMIN);
        await page.getByRole('button', { name: 'Contraer menú' }).click();
        await page.reload();
        await expect(page.getByRole('button', { name: 'Expandir menú' })).toBeVisible();
        await page.getByRole('button', { name: 'Expandir menú' }).click();
    });
});

test.describe('seguridad y accesibilidad de la base', () => {
    test('cabeceras de seguridad presentes y ninguna violación de la CSP', async ({ page }) => {
        const violaciones = vigilarCsp(page);
        const respuesta = await page.goto('/');
        const cabeceras = respuesta?.headers() ?? {};
        expect(cabeceras['content-security-policy']).toContain("script-src 'self'");
        expect(cabeceras['x-content-type-options']).toBe('nosniff');
        await ingresar(page, ADMIN);
        await menuPanel(page);
        expect(violaciones).toEqual([]);
    });

    test('quien visita la tienda no descarga el código del panel', async ({ page }) => {
        const archivos: string[] = [];
        page.on('request', (r) => {
            if (r.resourceType() === 'script') archivos.push(r.url());
        });
        await page.goto('/');
        await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();
        expect(archivos.some((a) => a.includes('LayoutTienda'))).toBe(true);
        expect(archivos.filter((a) => a.includes('LayoutPanel'))).toEqual([]);
    });

    for (const ruta of ['/', '/ingresar', '/no-existe']) {
        test(`sin problemas de accesibilidad en ${ruta}`, async ({ page }) => {
            await page.goto(ruta);
            await expect(page.locator('main')).toBeVisible();
            const { violations } = await new AxeBuilder({ page }).analyze();
            expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
        });
    }

    test('sin problemas de accesibilidad en el panel', async ({ page }) => {
        await ingresar(page, ADMIN);
        const { violations } = await new AxeBuilder({ page }).analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
});
