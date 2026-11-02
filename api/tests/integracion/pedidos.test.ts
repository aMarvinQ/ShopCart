import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expirarCheckoutsVencidos } from '../../src/jobs/expirarCheckouts.js';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    OPERADOR,
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
    pagar,
    type Credencial,
    type ProductoPrueba,
} from '../apoyo/compras.js';

/* Pedidos del cliente y del panel: estados, cancelación, devoluciones y la expiración de checkouts. */
const app = crearAppPrueba();
let admin: SesionPrueba;
let operador: SesionPrueba;

interface Pedido {
    idPedido: number;
    numeroPedido: string;
    codigoEstado: string;
    total: number;
    puedeCancelar: boolean;
    idUsuario?: number | null;
    lineas: { idPedidoDetalle: number; cantidad: number; cantidadDevuelta: number; totalLinea: number }[];
    historial: { codigoEstado: string; comentario?: string; usuario?: string }[];
    pagos: { estado: string; monto: number }[];
    devoluciones: { montoReembolso: number; lineas: { cantidad: number; reingresa: boolean }[] }[];
}

const comoPersonal = (prueba: request.Test, sesion: SesionPrueba = operador) =>
    prueba.set('Authorization', `Bearer ${sesion.token}`);

/** Compra pagada: devuelve el pedido como lo ve el cliente. */
async function comprar(credencial: Credencial, producto: ProductoPrueba, cantidad: number, cuerpo: object) {
    const comprador = await agregar(app, credencial, producto.idVariante, cantidad);
    const checkout = datos<{ idCheckout: number }>(await iniciarCheckout(app, comprador, cuerpo).expect(201));
    return {
        comprador,
        ...datos<{ pedido: Pedido; tokenSeguimiento: string }>(
            await pagar(app, comprador, checkout.idCheckout).expect(201),
        ),
    };
}

async function clienteConDireccion() {
    const sesion = await registrarCliente(app);
    const { idDireccion } = datos<{ idDireccion: number }>(
        await request(app)
            .post('/api/v1/direcciones')
            .set('Authorization', `Bearer ${sesion.token}`)
            .send({
                alias: 'Casa',
                nombreDestinatario: 'Cliente Pedidos',
                telefono: '5555-0001',
                linea1: '1a calle 1-1 zona 1',
                idMunicipio: 101,
            })
            .expect(201),
    );
    return { credencial: { token: sesion.token } as Credencial, idDireccion };
}

const avanzar = (idPedido: number, estado: string, comentario?: string) =>
    comoPersonal(request(app).patch(`/api/v1/pedidos/${String(idPedido)}/estado`)).send({ estado, comentario });

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
    operador = await iniciarSesion(app, OPERADOR.correo, OPERADOR.contrasena);
});
afterAll(cerrarConexion);

describe('ciclo de vida del pedido (panel)', () => {
    it('avanza solo por las transiciones permitidas, con historial y quién lo hizo', async () => {
        const producto = await crearProducto(app, admin, { existencia: 5, precio: 50 });
        const { pedido } = await comprar({ cookie: '' }, producto, 3, {
            idMetodoEnvio: 1,
            invitado: DIRECCION_INVITADO,
        });

        // Búsqueda por número y filtro por estado.
        const encontrados = datos<{ idPedido: number; esInvitado: boolean; articulos: number }[]>(
            await comoPersonal(
                request(app).get(`/api/v1/pedidos?busqueda=${pedido.numeroPedido}&estado=PAGADO`),
            ).expect(200),
        );
        expect(encontrados).toMatchObject([{ idPedido: pedido.idPedido, esInvitado: true, articulos: 3 }]);

        const salto = await avanzar(pedido.idPedido, 'ENVIADO').expect(409);
        expect(codigoError(salto)).toBe('TRANSICION_NO_PERMITIDA');
        await avanzar(pedido.idPedido, 'EN_PREPARACION', 'Empacando').expect(200);
        await avanzar(pedido.idPedido, 'EN_PREPARACION').expect(200); // doble clic: no es error
        await avanzar(pedido.idPedido, 'ENVIADO', 'Guía 123').expect(200);
        const entregado = datos<Pedido>(await avanzar(pedido.idPedido, 'ENTREGADO').expect(200));

        expect(entregado.codigoEstado).toBe('ENTREGADO');
        expect(entregado.idUsuario).toBeNull(); // compra de invitado
        expect(entregado.historial.map((h) => h.codigoEstado)).toEqual([
            'PAGADO',
            'EN_PREPARACION',
            'ENVIADO',
            'ENTREGADO',
        ]);
        expect(entregado.historial[1]).toMatchObject({
            comentario: 'Empacando',
            usuario: expect.any(String) as string,
        });
        expect(entregado.puedeCancelar).toBe(false);

        // Estados con su propio proceso no se aceptan aquí.
        await avanzar(pedido.idPedido, 'CANCELADO').expect(400);
    });

    it('devoluciones parciales y total: reembolso proporcional, reingreso al inventario opcional y estado final', async () => {
        const producto = await crearProducto(app, admin, { existencia: 6, precio: 75 });
        const { credencial, idDireccion } = await clienteConDireccion();
        const { pedido } = await comprar(credencial, producto, 3, { idMetodoEnvio: 1, idDireccion });
        const linea = pedido.lineas[0];
        if (!linea) throw new Error('El pedido no tiene líneas');
        const devolver = (cantidad: number, reingresa: boolean) =>
            comoPersonal(request(app).post(`/api/v1/pedidos/${String(pedido.idPedido)}/devoluciones`)).send({
                motivo: 'Talla incorrecta',
                lineas: [{ idPedidoDetalle: linea.idPedidoDetalle, cantidad, reingresa }],
            });

        // Antes de entregarse no se devuelve.
        expect(codigoError(await devolver(1, true).expect(409))).toBe('PEDIDO_NO_DEVOLVIBLE');
        for (const estado of ['EN_PREPARACION', 'ENVIADO', 'ENTREGADO'])
            await avanzar(pedido.idPedido, estado).expect(200);
        expect(await existenciaDe(app, admin, producto)).toBe(3);

        const parcial = datos<Pedido>(await devolver(1, true).expect(201));
        expect(parcial.codigoEstado).toBe('DEVUELTO_PARCIAL');
        expect(parcial.devoluciones[0]?.montoReembolso).toBe(75);
        expect(await existenciaDe(app, admin, producto)).toBe(4); // reingresó

        expect(codigoError(await devolver(3, true).expect(409))).toBe('CANTIDAD_DEVOLUCION_EXCEDIDA');

        const total = datos<Pedido>(await devolver(2, false).expect(201));
        expect(total.codigoEstado).toBe('DEVUELTO');
        expect(total.lineas[0]?.cantidadDevuelta).toBe(3);
        // Reembolsado en total exactamente lo pagado por la línea (el envío no se reembolsa).
        expect(total.devoluciones.reduce((s, d) => s + d.montoReembolso, 0)).toBe(linea.totalLinea);
        expect(await existenciaDe(app, admin, producto)).toBe(4); // dañadas: no reingresan

        const lista = datos<{ numeroPedido: string; unidades: number }[]>(
            await comoPersonal(request(app).get('/api/v1/devoluciones?tamanoPagina=100')).expect(200),
        );
        expect(
            lista
                .filter((d) => d.numeroPedido === pedido.numeroPedido)
                .map((d) => d.unidades)
                .sort(),
        ).toEqual([1, 2]);
    });
});

describe('cancelación', () => {
    it('el cliente cancela su pedido PAGADO: vuelve la existencia y se registra el reembolso', async () => {
        const producto = await crearProducto(app, admin, { existencia: 4 });
        const { credencial, idDireccion } = await clienteConDireccion();
        const { pedido } = await comprar(credencial, producto, 2, { idMetodoEnvio: 1, idDireccion });
        expect(await existenciaDe(app, admin, producto)).toBe(2);

        const cancelado = datos<Pedido>(
            await comoComprador(
                request(app).post(`/api/v1/mis-pedidos/${String(pedido.idPedido)}/cancelar`),
                credencial,
            )
                .send({})
                .expect(200),
        );
        expect(cancelado.codigoEstado).toBe('CANCELADO');
        expect(cancelado.pagos.map((p) => p.estado)).toEqual(['APROBADO', 'REEMBOLSADO']);
        expect(await existenciaDe(app, admin, producto)).toBe(4);

        // Cancelado es final; otro cliente no puede cancelarlo (404).
        await comoComprador(request(app).post(`/api/v1/mis-pedidos/${String(pedido.idPedido)}/cancelar`), credencial)
            .send({})
            .expect(409);
        const otro = await registrarCliente(app);
        await comoComprador(request(app).post(`/api/v1/mis-pedidos/${String(pedido.idPedido)}/cancelar`), otro)
            .send({})
            .expect(404);
    });

    it('en preparación el cliente ya no cancela (409); el operador sí, con motivo obligatorio', async () => {
        const producto = await crearProducto(app, admin, { existencia: 2 });
        const { credencial, idDireccion } = await clienteConDireccion();
        const { pedido } = await comprar(credencial, producto, 1, { idMetodoEnvio: 1, idDireccion });
        await avanzar(pedido.idPedido, 'EN_PREPARACION').expect(200);

        const cliente = await comoComprador(
            request(app).post(`/api/v1/mis-pedidos/${String(pedido.idPedido)}/cancelar`),
            credencial,
        ).expect(409);
        expect(codigoError(cliente)).toBe('TRANSICION_NO_PERMITIDA');

        await comoPersonal(request(app).post(`/api/v1/pedidos/${String(pedido.idPedido)}/cancelar`))
            .send({})
            .expect(400);
        const cancelado = datos<Pedido>(
            await comoPersonal(request(app).post(`/api/v1/pedidos/${String(pedido.idPedido)}/cancelar`))
                .send({ motivo: 'Sin existencia en bodega' })
                .expect(200),
        );
        expect(cancelado.codigoEstado).toBe('CANCELADO');
        expect(cancelado.historial.at(-1)).toMatchObject({
            codigoEstado: 'CANCELADO',
            comentario: 'Sin existencia en bodega',
        });
        expect(await existenciaDe(app, admin, producto)).toBe(2);
    });

    it('el pedido de un invitado no se cancela desde la tienda (no tiene cuenta)', async () => {
        const producto = await crearProducto(app, admin, { existencia: 2 });
        const { pedido, tokenSeguimiento } = await comprar({ cookie: '' }, producto, 1, {
            idMetodoEnvio: 1,
            invitado: DIRECCION_INVITADO,
        });
        expect(pedido.puedeCancelar).toBe(false);
        const seguimiento = datos<Pedido>(
            await request(app).get(`/api/v1/seguimiento/${tokenSeguimiento}`).expect(200),
        );
        expect(seguimiento.historial[0]).not.toHaveProperty('usuario'); // la vista pública no dice quién
    });
});

describe('permisos del panel', () => {
    it('el cliente no entra al panel, el anónimo recibe 401 y el cliente no ve pedidos ajenos', async () => {
        const cliente = await registrarCliente(app);
        await request(app).get('/api/v1/pedidos').set('Authorization', `Bearer ${cliente.token}`).expect(403);
        await request(app).get('/api/v1/devoluciones').set('Authorization', `Bearer ${cliente.token}`).expect(403);
        await request(app).get('/api/v1/pedidos').expect(401);
        await request(app).get('/api/v1/mis-pedidos').set('Authorization', `Bearer ${operador.token}`).expect(403);
        const vacios = await request(app)
            .get('/api/v1/mis-pedidos')
            .set('Authorization', `Bearer ${cliente.token}`)
            .expect(200);
        expect(vacios.body).toMatchObject({ data: [], meta: { totalRegistros: 0 } });
    });

    it('filtros inválidos: estado desconocido (400) y rango de fechas invertido (422)', async () => {
        await comoPersonal(request(app).get('/api/v1/pedidos?estado=PERDIDO')).expect(400);
        const rango = await comoPersonal(
            request(app).get('/api/v1/pedidos?fechaDesde=2026-11-02T00:00:00Z&fechaHasta=2026-11-01T00:00:00Z'),
        ).expect(422);
        expect(codigoError(rango)).toBe('RANGO_FECHAS_INVALIDO');
    });
});

describe('expiración de checkouts (job)', () => {
    it('procesa los vencidos y devuelve cuántos expiró y cuántas reservas liberó', async () => {
        const resultado = await expirarCheckoutsVencidos();
        expect(resultado.checkoutsExpirados).toBeGreaterThanOrEqual(0);
        expect(resultado.reservasLiberadas).toBeGreaterThanOrEqual(0);
        // Una segunda pasada inmediata ya no encuentra nada pendiente de expirar.
        expect((await expirarCheckoutsVencidos()).checkoutsExpirados).toBe(0);
    });
});
