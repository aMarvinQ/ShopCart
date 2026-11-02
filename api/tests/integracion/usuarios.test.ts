import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    ADMIN,
    cerrarConexion,
    correoUnico,
    crearAppPrueba,
    iniciarSesion,
    registrarCliente,
    type SesionPrueba,
} from '../apoyo/app.js';

const app = crearAppPrueba();
let admin: SesionPrueba;

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
});
afterAll(cerrarConexion);

const codigo = (respuesta: request.Response): string => (respuesta.body as { error: { codigo: string } }).error.codigo;

describe('perfil', () => {
    it('cada usuario actualiza solo su perfil (el usuario sale del token)', async () => {
        const cliente = await registrarCliente(app);
        const respuesta = await request(app)
            .put('/api/v1/perfil')
            .set('Authorization', `Bearer ${cliente.token}`)
            .send({ nombre: 'Lucía', apellido: 'Méndez', telefono: '5555-0000' })
            .expect(200);
        expect(respuesta.body).toMatchObject({
            data: { idUsuario: cliente.idUsuario, nombre: 'Lucía', apellido: 'Méndez', telefono: '5555-0000' },
        });
    });
});

describe('administración de usuarios', () => {
    it('el administrador lista con filtros, paginación y columnas en camelCase', async () => {
        const respuesta = await request(app)
            .get('/api/v1/usuarios?rol=OPERADOR&tamanoPagina=1')
            .set('Authorization', `Bearer ${admin.token}`)
            .expect(200);
        const cuerpo = respuesta.body as { data: Record<string, unknown>[]; meta: { totalRegistros: number } };
        expect(cuerpo.data).toHaveLength(1);
        expect(cuerpo.data[0]).toMatchObject({ codigoRol: 'OPERADOR', idUsuario: expect.any(Number) as number });
        expect(cuerpo.meta).toMatchObject({ pagina: 1, tamanoPagina: 1 });
        expect(cuerpo.meta.totalRegistros).toBeGreaterThanOrEqual(2);
    });

    it('un cliente no puede administrar usuarios (403) y la paginación se valida (400)', async () => {
        const cliente = await registrarCliente(app);
        const prohibido = await request(app)
            .get('/api/v1/usuarios')
            .set('Authorization', `Bearer ${cliente.token}`)
            .expect(403);
        expect(codigo(prohibido)).toBe('PERMISO_DENEGADO');
        await request(app)
            .get('/api/v1/usuarios?tamanoPagina=500')
            .set('Authorization', `Bearer ${admin.token}`)
            .expect(400);
    });

    it('crea un operador; al desactivarlo se revocan sus sesiones y ya no puede entrar', async () => {
        const correo = correoUnico('operador');
        const creado = await request(app)
            .post('/api/v1/usuarios')
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ correo, contrasena: 'Operador2026', nombre: 'Pedro', apellido: 'Álvarez', rol: 'OPERADOR' })
            .expect(201);
        const idOperador = (creado.body as { data: { idUsuario: number } }).data.idUsuario;
        const operador = await iniciarSesion(app, correo, 'Operador2026');

        const desactivado = await request(app)
            .patch(`/api/v1/usuarios/${idOperador}/estado`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ activo: false })
            .expect(200);
        expect(desactivado.body).toMatchObject({ data: { activo: false, estadoCambiado: true, sesionesRevocadas: 1 } });

        const login = await request(app)
            .post('/api/v1/auth/login')
            .send({ correo, contrasena: 'Operador2026' })
            .expect(401);
        expect(codigo(login)).toBe('USUARIO_INACTIVO');
        await request(app).post('/api/v1/auth/refresh').set('Cookie', operador.cookie).expect(401);
    });

    it('un administrador no puede desactivarse a sí mismo (409)', async () => {
        const respuesta = await request(app)
            .patch(`/api/v1/usuarios/${admin.idUsuario}/estado`)
            .set('Authorization', `Bearer ${admin.token}`)
            .send({ activo: false })
            .expect(409);
        expect(codigo(respuesta)).toBe('AUTODESACTIVACION_NO_PERMITIDA');
    });
});
