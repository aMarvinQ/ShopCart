import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarConexion, crearAppPrueba } from '../apoyo/app.js';

const app = crearAppPrueba();
afterAll(cerrarConexion);

describe('GET /api/v1/health', () => {
    it('responde 200 con el estado de la base, consultado por SP como la API', async () => {
        const respuesta = await request(app).get('/api/v1/health').expect(200);
        expect(respuesta.body).toMatchObject({
            data: { estado: 'ok', baseDatos: { scriptsAplicados: expect.any(Number) as number } },
        });
        expect(respuesta.headers['x-request-id']).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    });

    it('conserva el X-Request-Id recibido si tiene un formato seguro y lo reemplaza si no', async () => {
        const conservado = await request(app).get('/api/v1/health').set('X-Request-Id', 'prueba-12345678');
        expect(conservado.headers['x-request-id']).toBe('prueba-12345678');
        const reemplazado = await request(app).get('/api/v1/health').set('X-Request-Id', '<script>');
        expect(reemplazado.headers['x-request-id']).not.toBe('<script>');
    });
});

describe('errores con el formato acordado', () => {
    it('una ruta inexistente → 404 { error: { codigo, mensaje, requestId } }', async () => {
        const respuesta = await request(app).get('/api/v1/no-existe').expect(404);
        expect(respuesta.body).toEqual({
            error: {
                codigo: 'RUTA_NO_ENCONTRADA',
                mensaje: expect.any(String) as string,
                requestId: respuesta.headers['x-request-id'],
            },
        });
    });

    it('un JSON mal formado → 400 JSON_INVALIDO', async () => {
        const respuesta = await request(app)
            .post('/api/v1/health')
            .set('Content-Type', 'application/json')
            .send('{"x":')
            .expect(400);
        expect(respuesta.body).toMatchObject({ error: { codigo: 'JSON_INVALIDO' } });
    });

    it('un cuerpo de más de 100 KB → 413 CUERPO_DEMASIADO_GRANDE', async () => {
        const respuesta = await request(app)
            .post('/api/v1/health')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ texto: 'x'.repeat(110_000) }))
            .expect(413);
        expect(respuesta.body).toMatchObject({ error: { codigo: 'CUERPO_DEMASIADO_GRANDE' } });
    });
});

describe('seguridad base', () => {
    it('cabeceras de helmet y sin X-Powered-By', async () => {
        const respuesta = await request(app).get('/api/v1/health');
        expect(respuesta.headers['x-content-type-options']).toBe('nosniff');
        expect(respuesta.headers['x-powered-by']).toBeUndefined();
    });

    it('CORS solo para los orígenes configurados', async () => {
        const permitido = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
        expect(permitido.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        expect(permitido.headers['access-control-allow-credentials']).toBe('true');
        const ajeno = await request(app).get('/api/v1/health').set('Origin', 'https://sitio-ajeno.example');
        expect(ajeno.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('/uploads no lista carpetas ni sirve archivos ocultos', async () => {
        await request(app).get('/uploads/').expect(404);
        await request(app).get('/uploads/.env').expect(404);
    });
});
