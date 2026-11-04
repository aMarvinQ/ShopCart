// @vitest-environment node
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { alTerminarSesion, fijarToken, obtenerToken } from '../sesion/token';
import { api } from './cliente';
import { debeReintentar, MAXIMO_REINTENTOS } from './consultas';
import { ErrorApi, SESION_TERMINADA, SIN_CONEXION } from './errores';

/* En Node: su fetch no acepta las señales de jsdom. */
const ORIGEN = 'http://tienda.test';
const API = `${ORIGEN}/api/v1`;
const USUARIO = { idUsuario: 1, correo: 'a@b.test', nombre: 'Ana', apellido: 'Paz', codigoRol: 'CLIENTE' };

const expirado = () =>
    HttpResponse.json(
        { error: { codigo: 'TOKEN_EXPIRADO', mensaje: 'Venció', requestId: 'r' } },
        { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
const sesion = (token: string) =>
    HttpResponse.json({ data: { accessToken: token, tipo: 'Bearer', expiraEn: 900, usuario: USUARIO } });

const servidor = setupServer();
const almacen = new Map<string, string>();

beforeAll(() => {
    servidor.listen({ onUnhandledFrame: 'error' });
});
beforeEach(() => {
    vi.stubGlobal('location', { origin: ORIGEN });
    vi.stubGlobal('localStorage', {
        getItem: (c: string) => almacen.get(c) ?? null,
        setItem: (c: string, v: string) => almacen.set(c, v),
        removeItem: (c: string) => almacen.delete(c),
    });
    almacen.clear();
    fijarToken('viejo');
});
afterEach(() => {
    servidor.resetHandlers();
    vi.unstubAllGlobals();
    fijarToken(null);
});
afterAll(() => {
    servidor.close();
});

/** /perfil responde según el token: el viejo está vencido. */
function perfilSegunToken(llamadas: string[] = []) {
    return http.get(`${API}/perfil`, async ({ request }) => {
        const autorizacion = request.headers.get('Authorization') ?? '';
        llamadas.push(autorizacion);
        await delay(5);
        return autorizacion === 'Bearer nuevo' ? HttpResponse.json({ data: USUARIO }) : expirado();
    });
}

describe('renovación transparente del token', () => {
    it('cinco peticiones vencidas a la vez hacen UNA sola renovación y todas terminan bien', async () => {
        let renovaciones = 0;
        servidor.use(
            perfilSegunToken(),
            http.post(`${API}/auth/refresh`, async () => {
                renovaciones += 1;
                await delay(20);
                return sesion('nuevo');
            }),
        );
        const resultados = await Promise.all(Array.from({ length: 5 }, () => api.get('/perfil')));
        expect(renovaciones).toBe(1);
        expect(resultados.map((r) => r.data.nombre)).toEqual(Array.from({ length: 5 }, () => 'Ana'));
        expect(obtenerToken()).toBe('nuevo');
    });

    it('si otra petición ya renovó mientras esta iba en camino, no rota de nuevo', async () => {
        let renovaciones = 0;
        const llamadas: string[] = [];
        servidor.use(
            http.get(`${API}/perfil`, async ({ request }) => {
                const autorizacion = request.headers.get('Authorization') ?? '';
                llamadas.push(autorizacion);
                if (autorizacion === 'Bearer nuevo') return HttpResponse.json({ data: USUARIO });
                fijarToken('nuevo'); // la otra petición terminó de renovar justo antes de esta respuesta
                await delay(1);
                return expirado();
            }),
            http.post(`${API}/auth/refresh`, () => {
                renovaciones += 1;
                return sesion('otro');
            }),
        );
        await api.get('/perfil');
        expect(renovaciones).toBe(0);
        expect(llamadas).toEqual(['Bearer viejo', 'Bearer nuevo']);
    });

    it('se repite una sola vez: si sigue vencido responde el error, sin ciclos', async () => {
        const llamadas: string[] = [];
        servidor.use(
            http.get(`${API}/perfil`, ({ request }) => {
                llamadas.push(request.headers.get('Authorization') ?? '');
                return expirado();
            }),
            http.post(`${API}/auth/refresh`, () => sesion('nuevo')),
        );
        await expect(api.get('/perfil')).rejects.toMatchObject({ codigo: 'TOKEN_EXPIRADO' });
        expect(llamadas).toHaveLength(2);
    });

    it('si la API rechaza la renovación, la sesión termina: se limpia el token y se avisa', async () => {
        const avisado = vi.fn();
        const cancelar = alTerminarSesion(avisado);
        almacen.set('shopcart_con_sesion', '1');
        servidor.use(
            perfilSegunToken(),
            http.post(`${API}/auth/refresh`, () =>
                HttpResponse.json({ error: { codigo: 'SESION_EXPIRADA', mensaje: 'x' } }, { status: 401 }),
            ),
        );
        await expect(api.get('/perfil')).rejects.toMatchObject({ estado: 401, codigo: SESION_TERMINADA });
        expect(obtenerToken()).toBeNull();
        expect(avisado).toHaveBeenCalledTimes(1);
        expect(almacen.has('shopcart_con_sesion')).toBe(false);
        cancelar();
    });

    it('una falla pasajera al renovar NO cierra la sesión: se puede reintentar', async () => {
        const avisado = vi.fn();
        const cancelar = alTerminarSesion(avisado);
        servidor.use(
            perfilSegunToken(),
            http.post(`${API}/auth/refresh`, () =>
                HttpResponse.json({ error: { codigo: 'BASE_DATOS_NO_DISPONIBLE', mensaje: 'x' } }, { status: 503 }),
            ),
        );
        await expect(api.get('/perfil')).rejects.toMatchObject({ estado: 503 });
        expect(obtenerToken()).toBe('viejo');
        expect(avisado).not.toHaveBeenCalled();
        cancelar();
    });

    it('ROTACION_CONCURRENTE (otra pestaña rotó): se reintenta una vez con la cookie nueva', async () => {
        let renovaciones = 0;
        servidor.use(
            perfilSegunToken(),
            http.post(`${API}/auth/refresh`, () => {
                renovaciones += 1;
                return renovaciones === 1
                    ? HttpResponse.json({ error: { codigo: 'ROTACION_CONCURRENTE', mensaje: 'x' } }, { status: 401 })
                    : sesion('nuevo');
            }),
        );
        await expect(api.get('/perfil')).resolves.toBeDefined();
        expect(renovaciones).toBe(2);
    });

    it('los tokens nunca se guardan en el almacenamiento del navegador', async () => {
        servidor.use(
            perfilSegunToken(),
            http.post(`${API}/auth/refresh`, () => sesion('nuevo')),
        );
        await api.get('/perfil');
        expect([...almacen.entries()]).toEqual([['shopcart_con_sesion', '1']]);
    });
});

describe('peticiones y errores', () => {
    it('sustituye parámetros, omite filtros vacíos y envía el cuerpo como JSON', async () => {
        let recibido: { url: string; cuerpo: unknown; tipo: string | null; clave: string | null } | undefined;
        servidor.use(
            http.post(`${API}/checkout/:id/pago`, async ({ request }) => {
                recibido = {
                    url: request.url,
                    cuerpo: await request.json(),
                    tipo: request.headers.get('Content-Type'),
                    clave: null,
                };
                return HttpResponse.json({ data: {} });
            }),
        );
        const tarjeta = { numero: '4242', titular: 'A', vencimiento: '12/30', cvv: '123' };
        await api.post('/checkout/{id}/pago', { params: { id: 7 }, cuerpo: { tarjeta } });
        expect(recibido?.url).toBe(`${API}/checkout/7/pago`);
        expect(recibido?.cuerpo).toEqual({ tarjeta });
        expect(recibido?.tipo).toBe('application/json');

        let url = '';
        servidor.use(
            http.get(`${API}/pedidos`, ({ request }) => {
                url = request.url;
                return HttpResponse.json({ data: [], meta: {} });
            }),
        );
        await api.get('/pedidos', { query: { pagina: 2, tamanoPagina: 20, ordenarPor: 'TOTAL', busqueda: '' } });
        expect(url).toBe(`${API}/pedidos?pagina=2&tamanoPagina=20&ordenarPor=TOTAL`);
    });

    it('envía las cabeceras tipadas (Idempotency-Key)', async () => {
        let clave: string | null = null;
        servidor.use(
            http.post(`${API}/checkout`, ({ request }) => {
                clave = request.headers.get('idempotency-key');
                return HttpResponse.json({ data: {} }, { status: 201 });
            }),
        );
        await api.post('/checkout', {
            cabeceras: { 'idempotency-key': '3f6c2a1e-8d4b-4c7a-9e2f-1b5d7c9a0e34' },
            cuerpo: { idMetodoEnvio: 1, idDireccion: 2 },
        });
        expect(clave).toBe('3f6c2a1e-8d4b-4c7a-9e2f-1b5d7c9a0e34');
    });

    it('traduce el error de la API con detalles por campo, referencia y tiempo de espera', async () => {
        servidor.use(
            http.post(`${API}/auth/login`, () =>
                HttpResponse.json(
                    {
                        error: {
                            codigo: 'DEMASIADOS_INTENTOS',
                            mensaje: 'Espera',
                            requestId: 'abc',
                            detalles: [{ campo: 'correo', mensaje: 'mal' }],
                        },
                    },
                    { status: 429, headers: { 'Retry-After': '120' } },
                ),
            ),
        );
        const error: unknown = await api
            .post('/auth/login', { cuerpo: { correo: 'a@b.test', contrasena: 'x' } })
            .catch((e: unknown) => e);
        expect(error).toBeInstanceOf(ErrorApi);
        expect(error).toMatchObject({
            estado: 429,
            codigo: 'DEMASIADOS_INTENTOS',
            requestId: 'abc',
            reintentarEn: 120,
            detalles: [{ campo: 'correo', mensaje: 'mal' }],
        });
    });

    it('tolera un error que no es JSON (p. ej. de un proxy)', async () => {
        servidor.use(http.get(`${API}/perfil`, () => new HttpResponse('Bad gateway', { status: 502 })));
        await expect(api.get('/perfil')).rejects.toMatchObject({ estado: 502, esPasajero: true });
    });

    it('sin red: SIN_CONEXION; cancelar: AbortError, no un error para el usuario', async () => {
        servidor.use(http.get(`${API}/perfil`, () => HttpResponse.error()));
        await expect(api.get('/perfil')).rejects.toMatchObject({ codigo: SIN_CONEXION, estado: 0 });

        servidor.use(
            http.get(`${API}/perfil`, async () => {
                await delay(1000);
                return HttpResponse.json({ data: USUARIO });
            }),
        );
        const control = new AbortController();
        const pendiente = api.get('/perfil', { signal: control.signal });
        control.abort();
        await expect(pendiente).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('el compilador rechaza rutas y datos que la API no tiene', () => {
        const nunca = () => {
            // @ts-expect-error la ruta no existe
            void api.get('/no-existe');
            // @ts-expect-error falta el parámetro id
            void api.get('/pedidos/{id}');
            // @ts-expect-error no se puede ordenar por esta columna
            void api.get('/pedidos', { query: { pagina: 1, tamanoPagina: 20, ordenarPor: 'ARTICULOS' } });
            // @ts-expect-error falta el cuerpo
            void api.post('/auth/login');
        };
        expect(typeof nunca).toBe('function');
    });
});

describe('reintentos de consultas', () => {
    const pasajero = new ErrorApi(0, SIN_CONEXION, 'x');
    it('solo reintenta fallas pasajeras y con tope; un 4xx nunca', () => {
        expect(debeReintentar(0, pasajero)).toBe(true);
        expect(debeReintentar(MAXIMO_REINTENTOS, pasajero)).toBe(false);
        expect(debeReintentar(0, new ErrorApi(404, 'X', 'x'))).toBe(false);
        expect(debeReintentar(0, new ErrorApi(503, 'X', 'x'))).toBe(true);
        expect(debeReintentar(0, new Error('otro'))).toBe(false);
    });
});
