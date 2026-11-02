import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarConexion, correoUnico, crearAppPrueba, registrarCliente } from '../apoyo/app.js';

// App propia con el límite de intentos activo (el resto de las pruebas lo desactiva).
const app = crearAppPrueba({ LIMITE_INTENTOS: 'activo' });
afterAll(cerrarConexion);

describe('límite de intentos (D66)', () => {
    it('login: el intento fallido 11 del mismo correo en 15 minutos → 429 DEMASIADOS_INTENTOS', async () => {
        const correo = correoUnico('fuerza');
        for (let i = 1; i <= 10; i += 1) {
            await request(app)
                .post('/api/v1/auth/login')
                .send({ correo, contrasena: `Mala${i}x` })
                .expect(401);
        }
        const bloqueado = await request(app)
            .post('/api/v1/auth/login')
            .send({ correo, contrasena: 'Mala11x' })
            .expect(429);
        expect(bloqueado.body).toMatchObject({ error: { codigo: 'DEMASIADOS_INTENTOS' } });
        expect(bloqueado.headers['retry-after']).toBeDefined();
    });

    it('registro: el sexto en una hora desde la misma IP → 429', async () => {
        for (let i = 1; i <= 5; i += 1) await registrarCliente(app);
        await request(app)
            .post('/api/v1/auth/registro')
            .send({ correo: correoUnico(), contrasena: 'Prueba2026', nombre: 'Uno', apellido: 'Más' })
            .expect(429);
    });
});

describe('documentación (D68)', () => {
    it('OpenAPI generado de los esquemas, con las rutas de la API y el esquema de seguridad', async () => {
        const respuesta = await request(app).get('/api/v1/docs/openapi.json').expect(200);
        const documento = respuesta.body as {
            openapi: string;
            paths: Record<string, unknown>;
            components: Record<string, unknown>;
        };
        expect(documento.openapi).toBe('3.1.0');
        expect(Object.keys(documento.paths)).toEqual(
            expect.arrayContaining([
                '/api/v1/auth/login',
                '/api/v1/perfil',
                '/api/v1/usuarios/{id}/estado',
                '/api/v1/direcciones/{id}',
            ]),
        );
        expect(documento.components).toHaveProperty('securitySchemes.bearerAuth');
    });

    it('Swagger UI responde en /api/v1/docs', async () => {
        const respuesta = await request(app).get('/api/v1/docs/').expect(200);
        expect(respuesta.text).toContain('swagger-ui');
    });
});
