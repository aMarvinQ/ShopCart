import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    correoUnico,
    crearAppPrueba,
    datos,
    iniciarSesion,
    registrarCliente,
    sufijo,
    type SesionPrueba,
} from '../apoyo/app.js';

/* Carrito sobre el catálogo de la semilla de demostración (presente en la base de pruebas). */
const app = crearAppPrueba();
let admin: SesionPrueba;
const variantes = new Map<string, number>();

interface Carrito {
    idCarrito: number | null;
    subtotal: number;
    descuento: number;
    total: number;
    puedeComprar: boolean;
    cupon: { codigo: string; aplicable: boolean; codigoError: string | null; montoFaltante: number | null } | null;
    items: { idVariante: number; sku: string; cantidad: number; precioUnitario: number; estado: string }[];
}

async function idVariante(slug: string, sku: string): Promise<number> {
    const clave = `${slug}|${sku}`;
    if (!variantes.has(clave)) {
        const producto = datos<{ variantes: { idVariante: number; sku: string }[] }>(
            await request(app).get(`/api/v1/tienda/productos/${slug}`).expect(200),
        );
        for (const v of producto.variantes) variantes.set(`${slug}|${v.sku}`, v.idVariante);
    }
    const id = variantes.get(clave);
    if (id === undefined) throw new Error(`No existe ${sku}`);
    return id;
}

const cookieInvitado = (respuesta: request.Response): string | undefined =>
    (respuesta.headers['set-cookie'] as unknown as string[] | undefined)?.find((c) =>
        c.startsWith('shopcart_invitado='),
    );

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
});
afterAll(cerrarConexion);

describe('carrito del invitado (cookie)', () => {
    it('consultar sin cookie devuelve un carrito vacío y no crea la cookie', async () => {
        const respuesta = await request(app).get('/api/v1/carrito').expect(200);
        expect(datos<Carrito>(respuesta)).toMatchObject({ idCarrito: null, items: [], puedeComprar: false });
        expect(cookieInvitado(respuesta)).toBeUndefined();
    });

    it('agregar crea la cookie segura; luego se cambia la cantidad y se quita con la misma cookie', async () => {
        const cafe = await idVariante('cafe-molido-454-g', 'CAF');
        const agregado = await request(app)
            .post('/api/v1/carrito/items')
            .send({ idVariante: cafe, cantidad: 2 })
            .expect(200);
        const cookie = cookieInvitado(agregado) ?? '';
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Strict');
        expect(cookie).toContain('Path=/api/v1');
        const carrito = datos<Carrito>(agregado);
        expect(carrito.items).toMatchObject([{ sku: 'CAF', cantidad: 2, estado: 'DISPONIBLE' }]);
        expect(carrito.subtotal).toBe(2 * (carrito.items[0]?.precioUnitario ?? 0));

        const valor = cookie.split(';')[0] ?? '';
        const cambiado = await request(app)
            .put(`/api/v1/carrito/items/${cafe}`)
            .set('Cookie', valor)
            .send({ cantidad: 3 })
            .expect(200);
        expect(datos<Carrito>(cambiado).items[0]?.cantidad).toBe(3);
        const quitado = await request(app).delete(`/api/v1/carrito/items/${cafe}`).set('Cookie', valor).expect(200);
        expect(datos<Carrito>(quitado).items).toEqual([]);
    });

    it('topes: más que el límite por línea (422) y más que lo disponible (409), indicando el máximo', async () => {
        const cafe = await idVariante('cafe-molido-454-g', 'CAF');
        const limite = await request(app)
            .post('/api/v1/carrito/items')
            .send({ idVariante: cafe, cantidad: 11 })
            .expect(422);
        expect(codigoError(limite)).toBe('CANTIDAD_EXCEDE_LIMITE');

        const controlRojo = await idVariante('control-inalambrico-novaplay', 'CTL-ROJ'); // 2 disponibles en la semilla
        const stock = await request(app)
            .post('/api/v1/carrito/items')
            .send({ idVariante: controlRojo, cantidad: 3 })
            .expect(409);
        expect(codigoError(stock)).toBe('STOCK_INSUFICIENTE');
    });

    it('una variante que deja de venderse queda NO_DISPONIBLE y bloquea la compra', async () => {
        const bateria = await idVariante('bateria-portatil-10-000-mah', 'BAT-BLA');
        const cookie =
            cookieInvitado(
                await request(app).post('/api/v1/carrito/items').send({ idVariante: bateria }).expect(200),
            )?.split(';')[0] ?? '';
        const desactivar = (activo: boolean) =>
            request(app)
                .patch(`/api/v1/variantes/${bateria}/estado`)
                .set('Authorization', `Bearer ${admin.token}`)
                .send({ activo })
                .expect(200);
        await desactivar(false);
        try {
            const carrito = datos<Carrito>(await request(app).get('/api/v1/carrito').set('Cookie', cookie).expect(200));
            expect(carrito.items[0]?.estado).toBe('NO_DISPONIBLE');
            expect(carrito.puedeComprar).toBe(false);
        } finally {
            await desactivar(true);
        }
    });
});

describe('cupones en el carrito', () => {
    const marca = sufijo().toUpperCase();
    const ahora = Date.now();
    const dia = 24 * 60 * 60 * 1000;

    async function crearCupon(codigo: string, cambios: Record<string, unknown> = {}) {
        return datos<{ idCupon: number; versionFila: string; situacion: string }>(
            await request(app)
                .post('/api/v1/cupones')
                .set('Authorization', `Bearer ${admin.token}`)
                .send({
                    codigo,
                    descripcion: 'Cupón de prueba',
                    tipoDescuento: 'PORCENTAJE',
                    valor: 10,
                    fechaInicio: new Date(ahora - dia).toISOString(),
                    fechaFin: new Date(ahora + 30 * dia).toISOString(),
                    ...cambios,
                })
                .expect(201),
        );
    }

    it('un cupón vigente descuenta; uno de solo registrados se rechaza al invitado', async () => {
        await crearCupon(`P10-${marca}`);
        await crearCupon(`REG-${marca}`, { soloRegistrados: true });
        const cafe = await idVariante('cafe-molido-454-g', 'CAF');
        const cookie =
            cookieInvitado(
                await request(app).post('/api/v1/carrito/items').send({ idVariante: cafe, cantidad: 2 }).expect(200),
            )?.split(';')[0] ?? '';

        const aplicado = datos<Carrito>(
            await request(app)
                .post('/api/v1/carrito/cupon')
                .set('Cookie', cookie)
                .send({ codigo: `p10-${marca}` })
                .expect(200),
        );
        expect(aplicado.cupon).toMatchObject({ aplicable: true });
        expect(aplicado.descuento).toBeCloseTo(aplicado.subtotal * 0.1, 2);
        expect(aplicado.total).toBeCloseTo(aplicado.subtotal - aplicado.descuento, 2);

        const soloRegistrados = await request(app)
            .post('/api/v1/carrito/cupon')
            .set('Cookie', cookie)
            .send({ codigo: `REG-${marca}` })
            .expect(409);
        expect(codigoError(soloRegistrados)).toBe('CUPON_SOLO_REGISTRADOS');

        const sinCupon = datos<Carrito>(
            await request(app).delete('/api/v1/carrito/cupon').set('Cookie', cookie).expect(200),
        );
        expect(sinCupon).toMatchObject({ cupon: null, descuento: 0 });
    });

    it('cada motivo de rechazo con su código: programado, vencido, inactivo, monto mínimo e inexistente', async () => {
        const programado = `PRG-${marca}`;
        await crearCupon(programado, {
            fechaInicio: new Date(ahora + 10 * dia).toISOString(),
            fechaFin: new Date(ahora + 20 * dia).toISOString(),
        });
        const vencido = await crearCupon(`VEN-${marca}`);
        await request(app)
            .put(`/api/v1/cupones/${vencido.idCupon}`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                codigo: `VEN-${marca}`,
                descripcion: 'Vencido',
                tipoDescuento: 'PORCENTAJE',
                valor: 10,
                fechaInicio: new Date(ahora - 10 * dia).toISOString(),
                fechaFin: new Date(ahora - dia).toISOString(),
                versionFila: vencido.versionFila,
            })
            .expect(200);
        const inactivo = await crearCupon(`INA-${marca}`);
        await request(app)
            .patch(`/api/v1/cupones/${inactivo.idCupon}/estado`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ activo: false })
            .expect(200);
        await crearCupon(`MIN-${marca}`, { montoMinimo: 100000 });

        const cliente = await registrarCliente(app);
        await request(app)
            .post('/api/v1/carrito/items')
            .set('Authorization', `Bearer ${cliente.token}`)
            .send({ idVariante: await idVariante('cafe-molido-454-g', 'CAF') })
            .expect(200);
        const aplicar = (codigo: string) =>
            request(app).post('/api/v1/carrito/cupon').set('Authorization', `Bearer ${cliente.token}`).send({ codigo });

        expect(codigoError(await aplicar(programado).expect(409))).toBe('CUPON_NO_VIGENTE');
        expect(codigoError(await aplicar(`VEN-${marca}`).expect(409))).toBe('CUPON_VENCIDO');
        expect(codigoError(await aplicar(`INA-${marca}`).expect(409))).toBe('CUPON_INVALIDO');
        expect(codigoError(await aplicar('NO-EXISTE-XYZ').expect(409))).toBe('CUPON_INVALIDO');
        const minimo = await aplicar(`MIN-${marca}`).expect(409);
        expect(codigoError(minimo)).toBe('CUPON_MONTO_MINIMO');
        expect((minimo.body as { error: { mensaje: string } }).error.mensaje).toMatch(/\d/); // indica cuánto falta
    });
});

describe('fusión al iniciar sesión (D70)', () => {
    it('el carrito del invitado pasa al de la cuenta y la cookie del invitado se borra', async () => {
        const cafe = await idVariante('cafe-molido-454-g', 'CAF');
        const cookie =
            cookieInvitado(
                await request(app).post('/api/v1/carrito/items').send({ idVariante: cafe, cantidad: 2 }).expect(200),
            )?.split(';')[0] ?? '';

        const registro = await request(app)
            .post('/api/v1/auth/registro')
            .set('Cookie', cookie)
            .send({ correo: correoUnico(), contrasena: 'Prueba2026', nombre: 'Fusión', apellido: 'Prueba' })
            .expect(201);
        expect(cookieInvitado(registro)).toMatch(/^shopcart_invitado=;/);

        const token = datos<{ accessToken: string }>(registro).accessToken;
        const carrito = datos<Carrito>(
            await request(app).get('/api/v1/carrito').set('Authorization', `Bearer ${token}`).expect(200),
        );
        expect(carrito.items).toMatchObject([{ sku: 'CAF', cantidad: 2 }]);
    });
});

describe('quién puede tener carrito (D71)', () => {
    it('el personal recibe 403 y un token inválido 401 (no se trata como invitado)', async () => {
        expect(
            codigoError(
                await request(app).get('/api/v1/carrito').set('Authorization', `Bearer ${admin.token}`).expect(403),
            ),
        ).toBe('PERMISO_DENEGADO');
        expect(
            codigoError(await request(app).get('/api/v1/carrito').set('Authorization', 'Bearer x.y.z').expect(401)),
        ).toBe('TOKEN_INVALIDO');
    });

    it('cada cliente ve solo su carrito', async () => {
        const uno = await registrarCliente(app);
        const otro = await registrarCliente(app);
        await request(app)
            .post('/api/v1/carrito/items')
            .set('Authorization', `Bearer ${uno.token}`)
            .send({ idVariante: await idVariante('cafe-molido-454-g', 'CAF') })
            .expect(200);
        const ajeno = datos<Carrito>(
            await request(app).get('/api/v1/carrito').set('Authorization', `Bearer ${otro.token}`).expect(200),
        );
        expect(ajeno.items).toEqual([]);
    });
});
