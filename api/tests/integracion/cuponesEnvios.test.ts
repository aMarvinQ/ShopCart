import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    OPERADOR,
    sufijo,
    type SesionPrueba,
} from '../apoyo/app.js';

const app = crearAppPrueba();
let admin: SesionPrueba;

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
});
afterAll(cerrarConexion);

const comoAdmin = (prueba: request.Test) => prueba.set('Authorization', `Bearer ${admin.token}`);

describe('administración de cupones', () => {
    const codigo = `ADM-${sufijo().toUpperCase()}`;
    const dia = 24 * 60 * 60 * 1000;
    const datosCupon = {
        codigo,
        descripcion: 'Cupón de administración',
        tipoDescuento: 'MONTO_FIJO',
        valor: '25.00',
        montoMinimo: 150,
        fechaInicio: new Date(Date.now() - dia).toISOString(),
        fechaFin: new Date(Date.now() + 30 * dia).toISOString(),
        limiteUsosTotal: 100,
        limiteUsosPorCliente: 1,
    };

    it('crea, lista por situación, edita con la versión vigente y rechaza la versión vieja (409)', async () => {
        const creado = datos<{ idCupon: number; versionFila: string; situacion: string; valor: number }>(
            await comoAdmin(request(app).post('/api/v1/cupones')).send(datosCupon).expect(201),
        );
        expect(creado).toMatchObject({ situacion: 'VIGENTE', valor: 25 });

        const vigentes = await comoAdmin(
            request(app).get(`/api/v1/cupones?situacion=VIGENTE&busqueda=${codigo}`),
        ).expect(200);
        expect(datos<{ codigo: string }[]>(vigentes).map((c) => c.codigo)).toEqual([codigo]);

        await comoAdmin(request(app).put(`/api/v1/cupones/${creado.idCupon}`))
            .send({ ...datosCupon, descripcion: 'Editado', versionFila: creado.versionFila })
            .expect(200);
        const conflicto = await comoAdmin(request(app).put(`/api/v1/cupones/${creado.idCupon}`))
            .send({ ...datosCupon, descripcion: 'Otra vez', versionFila: creado.versionFila })
            .expect(409);
        expect(codigoError(conflicto)).toBe('EDICION_CONCURRENTE');
    });

    it('código repetido (409), porcentaje mayor que 100 (422) y fechas inválidas (400)', async () => {
        expect(codigoError(await comoAdmin(request(app).post('/api/v1/cupones')).send(datosCupon).expect(409))).toBe(
            'CODIGO_REGISTRADO',
        );
        await comoAdmin(request(app).post('/api/v1/cupones'))
            .send({ ...datosCupon, codigo: `${codigo}X`, tipoDescuento: 'PORCENTAJE', valor: 150 })
            .expect(422);
        await comoAdmin(request(app).post('/api/v1/cupones'))
            .send({ ...datosCupon, codigo: `${codigo}Y`, fechaFin: 'no-es-fecha' })
            .expect(400);
    });

    it('solo el administrador gestiona cupones', async () => {
        const operador = await iniciarSesion(app, OPERADOR.correo, OPERADOR.contrasena);
        await request(app).get('/api/v1/cupones').set('Authorization', `Bearer ${operador.token}`).expect(403);
    });
});

describe('métodos de envío', () => {
    it('la tienda ve los activos del más barato al más caro (sin sesión)', async () => {
        const metodos = datos<{ nombre: string; costo: number }[]>(
            await request(app).get('/api/v1/tienda/metodos-envio').expect(200),
        );
        expect(metodos.map((m) => m.nombre)).toEqual(
            expect.arrayContaining(['Recoger en tienda', 'Envío estándar', 'Envío exprés']),
        );
        expect(metodos.map((m) => m.nombre)).not.toContain('Envío económico'); // inactivo en la semilla
        expect(metodos.map((m) => m.costo)).toEqual([...metodos.map((m) => m.costo)].sort((a, b) => a - b));
    });

    it('el administrador crea, edita con versión y desactiva; los días se validan', async () => {
        const nombre = `Envío prueba ${sufijo()}`;
        const creado = datos<{ idMetodoEnvio: number; versionFila: string }>(
            await comoAdmin(request(app).post('/api/v1/metodos-envio'))
                .send({ nombre, costo: 30, diasEstimadosMin: 1, diasEstimadosMax: 2 })
                .expect(201),
        );
        const editado = datos<{ costo: number }>(
            await comoAdmin(request(app).put(`/api/v1/metodos-envio/${creado.idMetodoEnvio}`))
                .send({
                    nombre,
                    costo: '35.50',
                    diasEstimadosMin: 1,
                    diasEstimadosMax: 3,
                    versionFila: creado.versionFila,
                })
                .expect(200),
        );
        expect(editado.costo).toBe(35.5);
        await comoAdmin(request(app).patch(`/api/v1/metodos-envio/${creado.idMetodoEnvio}/estado`))
            .send({ activo: false })
            .expect(200);
        await comoAdmin(request(app).post('/api/v1/metodos-envio'))
            .send({ nombre: `${nombre} mal`, costo: 10, diasEstimadosMin: 5, diasEstimadosMax: 2 })
            .expect(400);
    });
});
