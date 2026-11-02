import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import {
    cerrarConexion,
    correoUnico,
    crearAppPrueba,
    iniciarSesion,
    registrarCliente,
    sesionDe,
} from '../apoyo/app.js';

const app = crearAppPrueba();
afterAll(cerrarConexion);

const codigo = (respuesta: request.Response): string => (respuesta.body as { error: { codigo: string } }).error.codigo;

describe('registro', () => {
    it('crea el cliente, inicia la sesión y deja el refresh token en una cookie segura', async () => {
        const correo = correoUnico();
        const respuesta = await request(app)
            .post('/api/v1/auth/registro')
            .send({ correo: `  ${correo.toUpperCase()} `, contrasena: 'Prueba2026', nombre: 'Ana', apellido: 'García' })
            .expect(201);
        expect(respuesta.body).toMatchObject({
            data: { tipo: 'Bearer', expiraEn: 900, usuario: { correo, codigoRol: 'CLIENTE' } },
        });
        const cookie = (respuesta.headers['set-cookie'] as unknown as string[])[0] ?? '';
        expect(cookie).toMatch(/^shopcart_refresh=/);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Strict');
        expect(cookie).toContain('Path=/api/v1/auth');
    });

    it('rechaza un correo ya registrado (409 CORREO_REGISTRADO)', async () => {
        const { correo } = await registrarCliente(app);
        const respuesta = await request(app)
            .post('/api/v1/auth/registro')
            .send({ correo, contrasena: 'Prueba2026', nombre: 'Otra', apellido: 'Persona' })
            .expect(409);
        expect(codigo(respuesta)).toBe('CORREO_REGISTRADO');
    });

    it('aplica la política de contraseña e indica el campo', async () => {
        const respuesta = await request(app)
            .post('/api/v1/auth/registro')
            .send({ correo: correoUnico(), contrasena: 'solotexto', nombre: 'Ana', apellido: 'García' })
            .expect(400);
        expect(respuesta.body).toMatchObject({
            error: {
                codigo: 'SOLICITUD_INVALIDA',
                detalles: [{ campo: 'contrasena', mensaje: 'debe incluir al menos un número' }],
            },
        });
    });
});

describe('inicio de sesión', () => {
    it('correo inexistente y contraseña incorrecta responden igual', async () => {
        const { correo } = await registrarCliente(app);
        const inexistente = await request(app)
            .post('/api/v1/auth/login')
            .send({ correo: correoUnico('nadie'), contrasena: 'Prueba2026' })
            .expect(401);
        const incorrecta = await request(app)
            .post('/api/v1/auth/login')
            .send({ correo, contrasena: 'Otra2026' })
            .expect(401);
        expect(codigo(inexistente)).toBe('CREDENCIALES_INVALIDAS');
        expect((incorrecta.body as { error: { mensaje: string } }).error.mensaje).toBe(
            (inexistente.body as { error: { mensaje: string } }).error.mensaje,
        );
    });

    it('con las credenciales correctas emite una sesión que abre el perfil', async () => {
        const { correo } = await registrarCliente(app);
        const sesion = await iniciarSesion(app, correo, 'Prueba2026');
        const perfil = await request(app)
            .get('/api/v1/perfil')
            .set('Authorization', `Bearer ${sesion.token}`)
            .expect(200);
        expect(perfil.body).toMatchObject({ data: { correo, codigoRol: 'CLIENTE', nombre: 'Cliente' } });
    });
});

describe('access token', () => {
    it('sin token → 401 NO_AUTENTICADO; alterado → 401 TOKEN_INVALIDO', async () => {
        expect(codigo(await request(app).get('/api/v1/perfil').expect(401))).toBe('NO_AUTENTICADO');
        const { token } = await registrarCliente(app);
        const alterado = await request(app).get('/api/v1/perfil').set('Authorization', `Bearer ${token}x`).expect(401);
        expect(codigo(alterado)).toBe('TOKEN_INVALIDO');
    });

    it('vencido → 401 TOKEN_EXPIRADO', async () => {
        const vencido = await new SignJWT({ rol: 'CLIENTE' })
            .setProtectedHeader({ alg: 'HS256' })
            .setSubject('1')
            .setIssuer('shopcart-api')
            .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
            .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
            .sign(new TextEncoder().encode(process.env.JWT_SECRETO));
        const respuesta = await request(app)
            .get('/api/v1/perfil')
            .set('Authorization', `Bearer ${vencido}`)
            .expect(401);
        expect(codigo(respuesta)).toBe('TOKEN_EXPIRADO');
    });
});

describe('renovación y cierre de sesión', () => {
    it('rota el refresh token; el anterior reusado de inmediato (otra pestaña) se rechaza sin cerrar la sesión', async () => {
        const original = await registrarCliente(app);
        const renovada = sesionDe(
            await request(app).post('/api/v1/auth/refresh').set('Cookie', original.cookie).expect(200),
        );
        expect(renovada.cookie).not.toBe(original.cookie);

        const concurrente = await request(app).post('/api/v1/auth/refresh').set('Cookie', original.cookie).expect(401);
        expect(codigo(concurrente)).toBe('ROTACION_CONCURRENTE');
        expect(concurrente.headers['set-cookie']).toBeUndefined(); // no borra la cookie de la otra pestaña

        await request(app).post('/api/v1/auth/refresh').set('Cookie', renovada.cookie).expect(200);
    });

    it('sin cookie → 401 SESION_INVALIDA', async () => {
        expect(codigo(await request(app).post('/api/v1/auth/refresh').expect(401))).toBe('SESION_INVALIDA');
    });

    it('logout revoca la sesión y borra la cookie', async () => {
        const sesion = await registrarCliente(app);
        const salida = await request(app).post('/api/v1/auth/logout').set('Cookie', sesion.cookie).expect(204);
        expect((salida.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^shopcart_refresh=;/);
        const despues = await request(app).post('/api/v1/auth/refresh').set('Cookie', sesion.cookie).expect(401);
        expect(codigo(despues)).toBe('SESION_INVALIDA');
    });
});

describe('cambio de contraseña', () => {
    it('exige la actual, cierra las demás sesiones y la nueva es la única válida', async () => {
        const { correo, token, cookie } = await registrarCliente(app);
        const otra = await iniciarSesion(app, correo, 'Prueba2026');

        const incorrecta = await request(app)
            .post('/api/v1/auth/cambiar-contrasena')
            .set('Authorization', `Bearer ${token}`)
            .send({ contrasenaActual: 'NoEs2026', contrasenaNueva: 'Nueva2026' })
            .expect(422);
        expect(codigo(incorrecta)).toBe('CONTRASENA_ACTUAL_INCORRECTA');

        const cambio = await request(app)
            .post('/api/v1/auth/cambiar-contrasena')
            .set('Authorization', `Bearer ${token}`)
            .set('Cookie', cookie)
            .send({ contrasenaActual: 'Prueba2026', contrasenaNueva: 'Nueva2026' })
            .expect(200);
        expect(cambio.body).toEqual({ data: { sesionesCerradas: 1 } });

        await request(app).post('/api/v1/auth/refresh').set('Cookie', otra.cookie).expect(401); // la otra sesión se cerró
        await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(200); // la actual sigue
        await request(app).post('/api/v1/auth/login').send({ correo, contrasena: 'Prueba2026' }).expect(401);
        await iniciarSesion(app, correo, 'Nueva2026');
    });
});
