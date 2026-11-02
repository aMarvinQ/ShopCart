import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    OPERADOR,
    registrarCliente,
    type SesionPrueba,
} from '../apoyo/app.js';

const app = crearAppPrueba();
let operador: SesionPrueba;

beforeAll(async () => {
    operador = await iniciarSesion(app, OPERADOR.correo, OPERADOR.contrasena);
});
afterAll(cerrarConexion);

const comoOperador = (prueba: request.Test) => prueba.set('Authorization', `Bearer ${operador.token}`);

interface Existencia {
    idVariante: number;
    sku: string;
    existenciaFisica: number;
    disponible: number;
}

async function existencia(sku: string): Promise<Existencia> {
    const filas = datos<Existencia[]>(
        await comoOperador(request(app).get(`/api/v1/inventario/existencias?busqueda=${sku}`)).expect(200),
    );
    const fila = filas.find((f) => f.sku === sku);
    if (!fila) throw new Error(`No existe ${sku}`);
    return fila;
}

describe('existencias', () => {
    it('el filtro de existencia baja incluye las variantes en venta con disponible ≤ EXISTENCIA_MINIMA', async () => {
        const respuesta = await comoOperador(
            request(app).get('/api/v1/inventario/existencias?soloExistenciaBaja=true&tamanoPagina=100'),
        ).expect(200);
        const filas = datos<Existencia[]>(respuesta);
        expect(filas.map((f) => f.sku)).toEqual(
            expect.arrayContaining(['CTL-ROJ', 'TEN-BLA-42', 'TER-VER', 'PLA-NEG-S']),
        );
        expect(filas.every((f) => f.disponible <= 5)).toBe(true);
    });
});

describe('movimientos y kardex', () => {
    it('una entrada por compra sube la existencia y queda en el kardex con su saldo', async () => {
        const antes = await existencia('TAZ');
        const registrado = datos<{ saldoAnterior: number; saldoNuevo: number; cantidad: number }[]>(
            await comoOperador(request(app).post('/api/v1/inventario/movimientos'))
                .send({ tipo: 'ENTRADA_COMPRA', lineas: [{ idVariante: antes.idVariante, cantidad: 6 }] })
                .expect(201),
        );
        expect(registrado[0]).toMatchObject({
            cantidad: 6,
            saldoAnterior: antes.existenciaFisica,
            saldoNuevo: antes.existenciaFisica + 6,
        });
        expect((await existencia('TAZ')).existenciaFisica).toBe(antes.existenciaFisica + 6);

        const kardex = datos<{ codigoTipo: string; cantidad: number; saldoNuevo: number }[]>(
            await comoOperador(
                request(app).get(`/api/v1/inventario/kardex?idVariante=${antes.idVariante}&tamanoPagina=1`),
            ).expect(200),
        );
        expect(kardex[0]).toMatchObject({
            codigoTipo: 'ENTRADA_COMPRA',
            cantidad: 6,
            saldoNuevo: antes.existenciaFisica + 6,
        });
    });

    it('un ajuste de salida exige motivo y no puede tomar más de lo disponible', async () => {
        const taza = await existencia('TAZ');
        const sinMotivo = await comoOperador(request(app).post('/api/v1/inventario/movimientos'))
            .send({ tipo: 'AJUSTE_SALIDA', lineas: [{ idVariante: taza.idVariante, cantidad: 1 }] })
            .expect(422);
        expect(codigoError(sinMotivo)).toBe('MOTIVO_INVALIDO');

        const excedido = await comoOperador(request(app).post('/api/v1/inventario/movimientos'))
            .send({
                tipo: 'AJUSTE_SALIDA',
                motivo: 'Conteo físico',
                lineas: [{ idVariante: taza.idVariante, cantidad: taza.disponible + 1 }],
            })
            .expect(409);
        expect(codigoError(excedido)).toBe('STOCK_INSUFICIENTE');

        const ajustado = datos<{ cantidad: number }[]>(
            await comoOperador(request(app).post('/api/v1/inventario/movimientos'))
                .send({
                    tipo: 'AJUSTE_SALIDA',
                    motivo: 'Una taza quebrada',
                    lineas: [{ idVariante: taza.idVariante, cantidad: 1 }],
                })
                .expect(201),
        );
        expect(ajustado[0]?.cantidad).toBe(-1); // el tipo pone el signo
    });

    it('rechaza tipos no manuales y variantes repetidas (400)', async () => {
        const taza = await existencia('TAZ');
        await comoOperador(request(app).post('/api/v1/inventario/movimientos'))
            .send({ tipo: 'SALIDA_VENTA', lineas: [{ idVariante: taza.idVariante, cantidad: 1 }] })
            .expect(400);
        await comoOperador(request(app).post('/api/v1/inventario/movimientos'))
            .send({
                tipo: 'ENTRADA_COMPRA',
                lineas: [
                    { idVariante: taza.idVariante, cantidad: 1 },
                    { idVariante: taza.idVariante, cantidad: 2 },
                ],
            })
            .expect(400);
    });

    it('la conciliación cuadra (lista vacía)', async () => {
        expect(datos(await comoOperador(request(app).get('/api/v1/inventario/conciliacion')).expect(200))).toEqual([]);
    });
});

describe('permisos del inventario', () => {
    it('un cliente no ve el inventario', async () => {
        const cliente = await registrarCliente(app);
        expect(
            codigoError(
                await request(app)
                    .get('/api/v1/inventario/existencias')
                    .set('Authorization', `Bearer ${cliente.token}`)
                    .expect(403),
            ),
        ).toBe('PERMISO_DENEGADO');
    });
});
