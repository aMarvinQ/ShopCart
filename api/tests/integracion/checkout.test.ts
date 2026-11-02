import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasarelaSimulada } from '../../src/pagos/pasarela.js';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    registrarCliente,
    type SesionPrueba,
} from '../apoyo/app.js';
import {
    agregar,
    comoComprador,
    crearProducto,
    DIRECCION_INVITADO,
    existenciaDe,
    iniciarCheckout,
    nuevaClave,
    pagar,
    TARJETA,
    type Credencial,
} from '../apoyo/compras.js';

/* Checkout y pago (plan 6.1–6.3, 6.6 y 6.7) contra la base de pruebas, con una pasarela propia para contar cobros. */
const pasarela = new PasarelaSimulada();
const app = crearAppPrueba({}, pasarela);
let admin: SesionPrueba;

interface Checkout {
    idCheckout: number;
    estado: string;
    segundosRestantes: number;
    subtotal: number;
    descuento: number;
    costoEnvio: number;
    total: number;
    baseImponible: number;
    iva: number;
    correoContacto: string;
    idPedido: number | null;
    lineas: { idVariante: number; cantidad: number; precioUnitario: number }[];
}
interface Pedido {
    idPedido: number;
    numeroPedido: string;
    codigoEstado: string;
    total: number;
    puedeCancelar: boolean;
    pagos: { estado: string; marca: string; ultimos4: string; motivoRechazo: string | null }[];
    lineas: { idPedidoDetalle: number; sku: string; cantidad: number }[];
}
interface Pago {
    pedido: Pedido;
    tokenSeguimiento: string;
}

const cobros = () => pasarela.movimientos().filter((m) => m.tipo === 'COBRO').length;
const anulaciones = () => pasarela.movimientos().filter((m) => m.tipo === 'ANULACION').length;

async function clienteConDireccion(): Promise<{ sesion: SesionPrueba; idDireccion: number }> {
    const sesion = await registrarCliente(app);
    const direccion = datos<{ idDireccion: number }>(
        await request(app)
            .post('/api/v1/direcciones')
            .set('Authorization', `Bearer ${sesion.token}`)
            .send({
                alias: 'Casa',
                nombreDestinatario: 'Cliente Prueba',
                telefono: '5555-0000',
                linea1: '6a avenida 1-10 zona 4',
                idMunicipio: 101,
            })
            .expect(201),
    );
    return { sesion, idDireccion: direccion.idDireccion };
}

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
});
afterAll(cerrarConexion);

describe('compra como invitado', () => {
    it('reserva al iniciar, es idempotente por clave, cobra una vez y entrega el enlace de seguimiento', async () => {
        const producto = await crearProducto(app, admin, { existencia: 5, precio: 120 });
        const invitado = await agregar(app, { cookie: '' }, producto.idVariante, 2);

        // Sin Idempotency-Key (D72) y sin datos del invitado: 400.
        const sinClave = await comoComprador(request(app).post('/api/v1/checkout'), invitado)
            .send({ idMetodoEnvio: 1, invitado: DIRECCION_INVITADO })
            .expect(400);
        expect(codigoError(sinClave)).toBe('SOLICITUD_INVALIDA');
        await iniciarCheckout(app, invitado, { idMetodoEnvio: 1 }).expect(400);

        const clave = nuevaClave();
        const checkout = datos<Checkout>(
            await iniciarCheckout(app, invitado, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }, clave).expect(201),
        );
        expect(checkout).toMatchObject({
            estado: 'PENDIENTE',
            subtotal: 240,
            correoContacto: DIRECCION_INVITADO.correo,
        });
        expect(checkout.segundosRestantes).toBeGreaterThan(14 * 60);
        expect(checkout.total).toBe(checkout.subtotal - checkout.descuento + checkout.costoEnvio);
        expect(checkout.baseImponible + checkout.iva).toBeCloseTo(checkout.total, 2);

        // Misma clave = mismo checkout (doble clic en "Continuar al pago").
        const repetido = datos<Checkout>(
            await iniciarCheckout(app, invitado, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }, clave).expect(201),
        );
        expect(repetido.idCheckout).toBe(checkout.idCheckout);

        // Ajeno: sin cookie o con otra sesión responde como inexistente.
        await request(app)
            .get(`/api/v1/checkout/${String(checkout.idCheckout)}`)
            .expect(404);
        const otro = await registrarCliente(app);
        await comoComprador(request(app).get(`/api/v1/checkout/${String(checkout.idCheckout)}`), otro).expect(404);
        await comoComprador(request(app).get(`/api/v1/checkout/${String(checkout.idCheckout)}`), invitado).expect(200);

        const antes = cobros();
        const pago = await pagar(app, invitado, checkout.idCheckout).expect(201);
        expect(pago.headers['cache-control']).toBe('no-store');
        const { pedido, tokenSeguimiento } = datos<Pago>(pago);
        expect(pedido).toMatchObject({ codigoEstado: 'PAGADO', total: checkout.total, puedeCancelar: false });
        expect(pedido.pagos).toMatchObject([{ estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' }]);
        expect(tokenSeguimiento).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(cobros()).toBe(antes + 1);
        expect(await existenciaDe(app, admin, producto)).toBe(3);

        // Pagar otra vez: el mismo pedido y el mismo enlace, sin cobrar de nuevo.
        const otraVez = datos<Pago>(await pagar(app, invitado, checkout.idCheckout).expect(201));
        expect(otraVez.pedido.idPedido).toBe(pedido.idPedido);
        expect(otraVez.tokenSeguimiento).toBe(tokenSeguimiento);
        expect(cobros()).toBe(antes + 1);

        // Seguimiento sin sesión; un token desconocido o mal formado: 404.
        const seguimiento = await request(app).get(`/api/v1/seguimiento/${tokenSeguimiento}`).expect(200);
        expect(datos<Pedido>(seguimiento).numeroPedido).toBe(pedido.numeroPedido);
        expect(seguimiento.headers['cache-control']).toBe('no-store');
        await request(app)
            .get(`/api/v1/seguimiento/${'A'.repeat(43)}`)
            .expect(404);
        expect(codigoError(await request(app).get('/api/v1/seguimiento/corto').expect(404))).toBe(
            'PEDIDO_NO_ENCONTRADO',
        );

        // El carrito quedó convertido: con la misma cookie se ve vacío.
        const carrito = datos<{ items: unknown[] }>(
            await comoComprador(request(app).get('/api/v1/carrito'), invitado).expect(200),
        );
        expect(carrito.items).toEqual([]);
    });
});

describe('compra del cliente registrado', () => {
    let cliente: { sesion: SesionPrueba; idDireccion: number };
    let credencial: Credencial;

    beforeAll(async () => {
        cliente = await clienteConDireccion();
        credencial = { token: cliente.sesion.token };
    });

    it('exige una dirección de su libreta; el rechazo del banco es 402 y queda registrado; luego paga', async () => {
        const producto = await crearProducto(app, admin, { existencia: 4, precio: 80 });
        await agregar(app, credencial, producto.idVariante, 1);

        const sinDireccion = await iniciarCheckout(app, credencial, { idMetodoEnvio: 1 }).expect(400);
        expect(codigoError(sinDireccion)).toBe('SOLICITUD_INVALIDA');
        expect(
            codigoError(await iniciarCheckout(app, credencial, { idMetodoEnvio: 1, idDireccion: 999999 }).expect(404)),
        ).toBe('DIRECCION_NO_ENCONTRADA');

        const checkout = datos<Checkout>(
            await iniciarCheckout(app, credencial, { idMetodoEnvio: 1, idDireccion: cliente.idDireccion }).expect(201),
        );

        const rechazo = await pagar(app, credencial, checkout.idCheckout, TARJETA.fondosInsuficientes).expect(402);
        expect(codigoError(rechazo)).toBe('FONDOS_INSUFICIENTES');
        // Robada o extraviada: al comprador se le responde como un rechazo genérico.
        expect(codigoError(await pagar(app, credencial, checkout.idCheckout, TARJETA.reportada).expect(402))).toBe(
            'TARJETA_RECHAZADA',
        );
        expect(
            datos<Checkout>(
                await comoComprador(
                    request(app).get(`/api/v1/checkout/${String(checkout.idCheckout)}`),
                    credencial,
                ).expect(200),
            ).estado,
        ).toBe('PENDIENTE');

        const { pedido } = datos<Pago>(
            await pagar(app, credencial, checkout.idCheckout, TARJETA.mastercard).expect(201),
        );
        expect(pedido.pagos.map((p) => `${p.estado}:${p.motivoRechazo ?? ''}`)).toEqual([
            'RECHAZADO:FONDOS_INSUFICIENTES',
            'RECHAZADO:TARJETA_REPORTADA',
            'APROBADO:',
        ]);
        expect(pedido.puedeCancelar).toBe(true);

        // Mis pedidos: aparece; otro cliente no lo ve.
        const mios = datos<{ idPedido: number }[]>(
            await comoComprador(request(app).get('/api/v1/mis-pedidos'), credencial).expect(200),
        );
        expect(mios.map((p) => p.idPedido)).toContain(pedido.idPedido);
        await comoComprador(request(app).get(`/api/v1/mis-pedidos/${String(pedido.idPedido)}`), credencial).expect(200);
        const otro = await registrarCliente(app);
        expect(
            codigoError(
                await comoComprador(request(app).get(`/api/v1/mis-pedidos/${String(pedido.idPedido)}`), otro).expect(
                    404,
                ),
            ),
        ).toBe('PEDIDO_NO_ENCONTRADO');
        await comoComprador(request(app).get('/api/v1/pedidos'), credencial).expect(403);
    });

    it('con cupón: el descuento queda congelado en el checkout y en el pedido', async () => {
        const producto = await crearProducto(app, admin, { existencia: 3, precio: 200 });
        const codigo = `CMP${String(Date.now()).slice(-8)}`;
        const dia = 24 * 60 * 60 * 1000;
        await request(app)
            .post('/api/v1/cupones')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({
                codigo,
                descripcion: 'Cupón de compra',
                tipoDescuento: 'PORCENTAJE',
                valor: 10,
                fechaInicio: new Date(Date.now() - dia).toISOString(),
                fechaFin: new Date(Date.now() + dia).toISOString(),
            })
            .expect(201);
        await agregar(app, credencial, producto.idVariante, 1);
        await comoComprador(request(app).post('/api/v1/carrito/cupon'), credencial).send({ codigo }).expect(200);

        const checkout = datos<Checkout>(
            await iniciarCheckout(app, credencial, { idMetodoEnvio: 1, idDireccion: cliente.idDireccion }).expect(201),
        );
        expect(checkout.descuento).toBe(20);
        const { pedido } = datos<Pago>(await pagar(app, credencial, checkout.idCheckout, TARJETA.amex).expect(201));
        expect(pedido).toMatchObject({ codigoCupon: codigo, descuento: 20, total: checkout.total });
        expect(pedido.pagos[0]).toMatchObject({ marca: 'AMEX', ultimos4: '0005' });
    });
});

describe('validación de la tarjeta (antes de la pasarela)', () => {
    it('Luhn, vencimiento, CVV según la marca y marca no aceptada: 400 por campo, sin cobrar', async () => {
        const antes = pasarela.movimientos().length;
        const probar = async (tarjeta: object, campo: string) => {
            const respuesta = await request(app).post('/api/v1/checkout/1/pago').send({ tarjeta }).expect(400);
            const detalles = (respuesta.body as { error: { detalles: { campo: string }[] } }).error.detalles;
            expect(detalles.map((d) => d.campo)).toContain(campo);
        };
        await probar({ ...TARJETA.visa, numero: '4242 4242 4242 4241' }, 'tarjeta.numero');
        await probar({ ...TARJETA.visa, numero: '6011111111111117' }, 'tarjeta.numero'); // Discover
        await probar({ ...TARJETA.visa, vencimiento: '01/20' }, 'tarjeta.vencimiento');
        await probar({ ...TARJETA.visa, vencimiento: '13/30' }, 'tarjeta.vencimiento');
        await probar({ ...TARJETA.amex, cvv: '123' }, 'tarjeta.cvv');
        await probar({ ...TARJETA.visa, cvv: '1234' }, 'tarjeta.cvv');
        expect(pasarela.movimientos().length).toBe(antes);
    });
});

describe('concurrencia (plan 6.1 y 6.2)', () => {
    it('doble clic al pagar: un solo pedido, un solo cobro y la existencia descontada una vez', async () => {
        const producto = await crearProducto(app, admin, { existencia: 3 });
        const invitado = await agregar(app, { cookie: '' }, producto.idVariante, 1);
        const checkout = datos<Checkout>(
            await iniciarCheckout(app, invitado, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }).expect(201),
        );
        const antes = cobros();
        const [a, b] = await Promise.all([
            pagar(app, invitado, checkout.idCheckout),
            pagar(app, invitado, checkout.idCheckout),
        ]);
        expect([a.status, b.status]).toEqual([201, 201]);
        expect(datos<Pago>(a).pedido.idPedido).toBe(datos<Pago>(b).pedido.idPedido);
        expect(cobros()).toBe(antes + 1);
        expect(await existenciaDe(app, admin, producto)).toBe(2);
    });

    it('dos tarjetas distintas a la vez: un solo pedido y el cobro sobrante, si lo hubo, se anula', async () => {
        const producto = await crearProducto(app, admin, { existencia: 3 });
        const invitado = await agregar(app, { cookie: '' }, producto.idVariante, 1);
        const checkout = datos<Checkout>(
            await iniciarCheckout(app, invitado, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }).expect(201),
        );
        const [cobrosAntes, anulacionesAntes] = [cobros(), anulaciones()];
        const [a, b] = await Promise.all([
            pagar(app, invitado, checkout.idCheckout, TARJETA.visa),
            pagar(app, invitado, checkout.idCheckout, TARJETA.mastercard),
        ]);
        expect([a.status, b.status]).toEqual([201, 201]);
        expect(datos<Pago>(a).pedido.idPedido).toBe(datos<Pago>(b).pedido.idPedido);
        // Cobros que quedaron en firme: exactamente uno.
        expect(cobros() - cobrosAntes - (anulaciones() - anulacionesAntes)).toBe(1);
        expect(datos<Pago>(a).pedido.pagos.filter((p) => p.estado === 'APROBADO')).toHaveLength(1);
        expect(await existenciaDe(app, admin, producto)).toBe(2);
    });

    it('la última unidad entre dos compradores simultáneos: uno la reserva y el otro recibe 409 STOCK_INSUFICIENTE', async () => {
        const producto = await crearProducto(app, admin, { existencia: 1 });
        const uno = await agregar(app, { cookie: '' }, producto.idVariante, 1);
        const dos = await agregar(app, { cookie: '' }, producto.idVariante, 1);
        const respuestas = await Promise.all(
            [uno, dos].map((c) => iniciarCheckout(app, c, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO })),
        );
        expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
        const perdedor = respuestas.find((r) => r.status === 409);
        expect(perdedor && codigoError(perdedor)).toBe('STOCK_INSUFICIENTE');

        // El ganador paga; la existencia llega a cero y nunca a negativo.
        const ganador = respuestas[0]?.status === 201 ? uno : dos;
        const idCheckout = datos<Checkout>(respuestas.find((r) => r.status === 201) as request.Response).idCheckout;
        await pagar(app, ganador, idCheckout).expect(201);
        expect(await existenciaDe(app, admin, producto)).toBe(0);
    });

    it('si el carrito cambia después de iniciar, ese checkout ya no se cobra (409 CHECKOUT_NO_PAGABLE)', async () => {
        const producto = await crearProducto(app, admin, { existencia: 5 });
        const invitado = await agregar(app, { cookie: '' }, producto.idVariante, 1);
        const checkout = datos<Checkout>(
            await iniciarCheckout(app, invitado, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }).expect(201),
        );
        await agregar(app, invitado, producto.idVariante, 1);
        const antes = cobros();
        expect(codigoError(await pagar(app, invitado, checkout.idCheckout).expect(409))).toBe('CHECKOUT_NO_PAGABLE');
        expect(cobros()).toBe(antes);
    });
});

describe('el último uso de un cupón (RF-05)', () => {
    it('dos clientes pagan a la vez con un cupón de un solo uso: uno lo obtiene, al otro se le anula el cobro', async () => {
        const producto = await crearProducto(app, admin, { existencia: 5, precio: 100 });
        const codigo = `UNO${String(Date.now()).slice(-8)}`;
        const dia = 24 * 60 * 60 * 1000;
        const cupon = datos<{ idCupon: number }>(
            await request(app)
                .post('/api/v1/cupones')
                .set('Authorization', `Bearer ${admin.token}`)
                .send({
                    codigo,
                    descripcion: 'Un solo uso',
                    tipoDescuento: 'MONTO_FIJO',
                    valor: 10,
                    fechaInicio: new Date(Date.now() - dia).toISOString(),
                    fechaFin: new Date(Date.now() + dia).toISOString(),
                    limiteUsosTotal: 1,
                })
                .expect(201),
        );
        // Aplicar no consume usos: los dos llegan al pago con el cupón.
        const checkouts = await Promise.all(
            [1, 2].map(async () => {
                const { sesion, idDireccion } = await clienteConDireccion();
                const credencial: Credencial = { token: sesion.token };
                await agregar(app, credencial, producto.idVariante, 1);
                await comoComprador(request(app).post('/api/v1/carrito/cupon'), credencial)
                    .send({ codigo })
                    .expect(200);
                const checkout = datos<Checkout>(
                    await iniciarCheckout(app, credencial, { idMetodoEnvio: 1, idDireccion }).expect(201),
                );
                return { credencial, idCheckout: checkout.idCheckout };
            }),
        );
        const anulacionesAntes = anulaciones();
        const pagos = await Promise.all(checkouts.map((c) => pagar(app, c.credencial, c.idCheckout)));
        expect(pagos.map((p) => p.status).sort()).toEqual([201, 409]);
        const rechazado = pagos.find((p) => p.status === 409);
        expect(rechazado && codigoError(rechazado)).toBe('CUPON_AGOTADO');
        expect(anulaciones()).toBe(anulacionesAntes + 1); // el cobro del perdedor no queda en firme

        const final = datos<{ usosActuales: number; situacion: string }>(
            await request(app)
                .get(`/api/v1/cupones/${String(cupon.idCupon)}`)
                .set('Authorization', `Bearer ${admin.token}`)
                .expect(200),
        );
        expect(final).toMatchObject({ usosActuales: 1, situacion: 'AGOTADO' });
        expect(await existenciaDe(app, admin, producto)).toBe(4); // solo una venta salió del inventario
    });
});

describe('quién puede comprar', () => {
    it('el personal no inicia checkouts (403) y un invitado sin carrito recibe 404', async () => {
        await iniciarCheckout(app, { token: admin.token }, { idMetodoEnvio: 1, idDireccion: 1 }).expect(403);
        expect(
            codigoError(
                await iniciarCheckout(app, { cookie: '' }, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }).expect(
                    404,
                ),
            ),
        ).toBe('CARRITO_NO_ENCONTRADO');
    });
});
