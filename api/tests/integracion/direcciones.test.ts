import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { ADMIN, cerrarConexion, crearAppPrueba, iniciarSesion, registrarCliente } from '../apoyo/app.js';

const app = crearAppPrueba();
afterAll(cerrarConexion);

const codigo = (respuesta: request.Response): string => (respuesta.body as { error: { codigo: string } }).error.codigo;

const direccion = (alias: string) => ({
    alias,
    nombreDestinatario: 'Cliente Prueba',
    telefono: '5555-1234',
    linea1: '4a calle 5-20 zona 1',
    idMunicipio: 108,
    codigoPostal: '01057',
});

describe('catálogos de ubicación (públicos)', () => {
    it('22 departamentos y los 17 municipios de Guatemala', async () => {
        const departamentos = await request(app).get('/api/v1/departamentos').expect(200);
        expect((departamentos.body as { data: unknown[] }).data).toHaveLength(22);
        const municipios = await request(app).get('/api/v1/departamentos/1/municipios').expect(200);
        expect((municipios.body as { data: unknown[] }).data).toHaveLength(17);
        expect((municipios.body as { data: unknown[] }).data).toContainEqual({ idMunicipio: 108, nombre: 'Mixco' });
    });

    it('departamento inexistente → 404 DEPARTAMENTO_NO_ENCONTRADO', async () => {
        expect(codigo(await request(app).get('/api/v1/departamentos/99/municipios').expect(404))).toBe(
            'DEPARTAMENTO_NO_ENCONTRADO',
        );
    });
});

describe('libreta de direcciones', () => {
    it('la primera dirección queda predeterminada y se devuelve la libreta con el municipio y departamento', async () => {
        const cliente = await registrarCliente(app);
        const respuesta = await request(app)
            .post('/api/v1/direcciones')
            .set('Authorization', `Bearer ${cliente.token}`)
            .send(direccion('Casa'))
            .expect(201);
        expect(respuesta.body).toMatchObject({
            data: {
                idDireccion: expect.any(Number) as number,
                direcciones: [{ alias: 'Casa', esPredeterminada: true, municipio: 'Mixco', departamento: 'Guatemala' }],
            },
        });
    });

    it('otro cliente no puede ver, editar, marcar ni eliminar una dirección ajena (404 como si no existiera)', async () => {
        const duena = await registrarCliente(app);
        const ajeno = await registrarCliente(app);
        const creada = await request(app)
            .post('/api/v1/direcciones')
            .set('Authorization', `Bearer ${duena.token}`)
            .send(direccion('Casa'))
            .expect(201);
        const id = (creada.body as { data: { idDireccion: number } }).data.idDireccion;
        const comoAjeno = (r: request.Test) => r.set('Authorization', `Bearer ${ajeno.token}`);

        expect(
            codigo(
                await comoAjeno(request(app).put(`/api/v1/direcciones/${id}`))
                    .send(direccion('Robada'))
                    .expect(404),
            ),
        ).toBe('DIRECCION_NO_ENCONTRADA');
        await comoAjeno(request(app).post(`/api/v1/direcciones/${id}/predeterminada`)).expect(404);
        await comoAjeno(request(app).delete(`/api/v1/direcciones/${id}`)).expect(404);
        expect((await comoAjeno(request(app).get('/api/v1/direcciones')).expect(200)).body).toEqual({ data: [] });

        const libreta = await request(app)
            .get('/api/v1/direcciones')
            .set('Authorization', `Bearer ${duena.token}`)
            .expect(200);
        expect(libreta.body).toMatchObject({ data: [{ idDireccion: id, alias: 'Casa' }] });
    });

    it('máximo 5 direcciones (409 LIMITE_DIRECCIONES) y datos inválidos (400)', async () => {
        const cliente = await registrarCliente(app);
        const agregar = (datos: object) =>
            request(app).post('/api/v1/direcciones').set('Authorization', `Bearer ${cliente.token}`).send(datos);
        for (let i = 1; i <= 5; i += 1) await agregar(direccion(`Dirección ${i}`)).expect(201);
        expect(codigo(await agregar(direccion('Sexta')).expect(409))).toBe('LIMITE_DIRECCIONES');
        await agregar({ ...direccion('Mala'), codigoPostal: '123' }).expect(400);
    });

    it('solo los clientes tienen libreta (403 para el personal)', async () => {
        const admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
        await request(app).get('/api/v1/direcciones').set('Authorization', `Bearer ${admin.token}`).expect(403);
    });
});
