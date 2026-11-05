import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
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

    test('recargar justo mientras se renueva la sesión no la cierra', async ({ page }) => {
        await ingresar(page, CLIENTE);
        await page.goto('/cuenta/perfil');
        for (let vuelta = 0; vuelta < 5; vuelta += 1) {
            const renovacion = page.waitForRequest('**/api/v1/auth/refresh');
            await page.reload({ waitUntil: 'commit' });
            await renovacion;
        }
        await page.reload();
        await expect(page.getByTestId('perfil-nombre')).toBeVisible();
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

test.describe('sin saltos entre pantallas', () => {
    const logoVisible = (page: Page) =>
        page.getByRole('link', { name: 'ShopCart, ir al inicio' }).filter({ visible: true }).first();

    async function posicion(ubicacion: Locator) {
        const caja = await ubicacion.boundingBox();
        if (!caja) throw new Error('El elemento no está visible.');
        return { x: Math.round(caja.x), y: Math.round(caja.y) };
    }

    test('logo y perfil quedan en el mismo lugar en tienda, panel y sin sesión', async ({ page }) => {
        await page.goto('/');
        const logoInvitado = await posicion(logoVisible(page));
        const iconoInvitado = await posicion(page.getByRole('link', { name: 'Ingresar' }).locator('svg'));
        const carritoInvitado = await posicion(page.getByRole('link', { name: 'Carrito' }));

        await ingresar(page, ADMIN);
        await expect(page).toHaveURL(/\/panel$/);
        await expect(page.locator('#menu-usuario')).toBeVisible();
        expect(await posicion(logoVisible(page))).toEqual(logoInvitado);
        expect(await posicion(page.locator('#menu-usuario svg'))).toEqual(iconoInvitado);

        await logoVisible(page).click();
        await expect(page).toHaveURL(/:\d+\/$/);
        // El carrito solo existe en la tienda: confirma que ya se cambió de estructura antes de medir.
        await expect(page.getByRole('link', { name: 'Carrito' })).toBeVisible();
        expect(await posicion(logoVisible(page))).toEqual(logoInvitado);
        expect(await posicion(page.locator('#menu-usuario svg'))).toEqual(iconoInvitado);
        expect(await posicion(page.getByRole('link', { name: 'Carrito' }))).toEqual(carritoInvitado);
    });

    test('contraer el menú no mueve las opciones; la flecha queda abajo y centrada', async ({ page, isMobile }) => {
        test.skip(isMobile, 'En móvil el menú es un cajón.');
        await ingresar(page, ADMIN);
        const menu = await menuPanel(page);
        const iconos = menu.locator('a svg');
        const flecha = page.getByRole('button', { name: 'Contraer menú' }).locator('svg');
        const leer = () =>
            iconos.evaluateAll((lista) => lista.map((i) => i.getBoundingClientRect().toJSON() as DOMRect));

        const antes = await leer();
        const flechaAntes = await posicion(flecha);
        const logoAntes = await posicion(logoVisible(page));
        await page.getByRole('button', { name: 'Contraer menú' }).click();
        await expect(page.locator('aside')).toHaveCSS('width', '72px');

        const despues = await leer();
        expect(despues.map((i) => [i.x, i.y])).toEqual(antes.map((i) => [i.x, i.y]));
        expect(await posicion(logoVisible(page))).toEqual(logoAntes);
        const flechaDespues = page.getByRole('button', { name: 'Expandir menú' }).locator('svg');
        expect(await posicion(flechaDespues)).toEqual(flechaAntes);

        // Iconos, logo y flecha centrados en los 72px; la flecha, debajo de todas las opciones.
        const caja = await flechaDespues.boundingBox();
        expect((caja?.x ?? 0) + (caja?.width ?? 0) / 2).toBeCloseTo(36, 0);
        for (const icono of despues) expect(icono.x + icono.width / 2).toBeCloseTo(36, 0);
        const logo = await logoVisible(page).boundingBox();
        expect((logo?.x ?? 0) + (logo?.width ?? 0) / 2).toBeCloseTo(36, 0);
        expect(caja?.y ?? 0).toBeGreaterThan(Math.max(...despues.map((i) => i.y)));
    });

    test('al recargar el panel, el esqueleto ya tiene el ancho del menú contraído', async ({ page, isMobile }) => {
        test.skip(isMobile, 'En móvil el menú es un cajón.');
        await ingresar(page, ADMIN);
        await page.getByRole('button', { name: 'Contraer menú' }).click();

        let soltar = () => {};
        const espera = new Promise<void>((resolver) => {
            soltar = resolver;
        });
        await page.route('**/api/v1/auth/refresh', async (ruta) => {
            await espera;
            await ruta.continue();
        });
        const recarga = page.reload({ waitUntil: 'commit' });
        const lateral = page.getByTestId('esqueleto-lateral');
        await expect(lateral).toBeVisible();
        expect((await lateral.boundingBox())?.width).toBe(72);
        soltar();
        await recarga;
        await expect(page.getByRole('button', { name: 'Expandir menú' })).toBeVisible();
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
