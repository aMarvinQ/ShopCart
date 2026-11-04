import type { AddressInfo } from 'node:net';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ServiciosApp } from '../../src/app.js';
import { hoyGuatemala } from '../../src/exportes/documento.js';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    OPERADOR,
    type SesionPrueba,
} from '../apoyo/app.js';
import { agregar, crearProducto, DIRECCION_INVITADO, iniciarCheckout, pagar } from '../apoyo/compras.js';

/* Reportes, exportaciones, caché, bitácora, parámetros y dashboard en tiempo real (solo administrador). */
const app = crearAppPrueba();
const servicios = app.locals.servicios as ServiciosApp;
let admin: SesionPrueba;
let operador: SesionPrueba;
const hoy = hoyGuatemala();

const comoAdmin = (prueba: request.Test) => prueba.set('Authorization', `Bearer ${admin.token}`);

interface Resumen {
    ventaNeta: number;
    pedidos: number;
    unidades: number;
    ticketPromedio: number;
    variantesExistenciaBaja: number;
    existenciaMinima: number;
}
const centavos = (valor: number) => Math.round(valor * 100);
const suma = (filas: { ventaNeta: number }[]) => filas.reduce((total, f) => total + centavos(f.ventaNeta), 0);

/** Una compra pagada de `cantidad` unidades a `precio`; devuelve el pedido. */
async function comprar(precio: number, cantidad: number) {
    const producto = await crearProducto(app, admin, { existencia: cantidad + 2, precio });
    const invitado = await agregar(app, { cookie: '' }, producto.idVariante, cantidad);
    const checkout = datos<{ idCheckout: number }>(
        await iniciarCheckout(app, invitado, { idMetodoEnvio: 1, invitado: DIRECCION_INVITADO }).expect(201),
    );
    return datos<{ pedido: { numeroPedido: string; subtotal: number; descuento: number } }>(
        await pagar(app, invitado, checkout.idCheckout).expect(201),
    ).pedido;
}

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
    operador = await iniciarSesion(app, OPERADOR.correo, OPERADOR.contrasena);
});
afterAll(async () => {
    servicios.cerrar();
    await cerrarConexion();
});

describe('integridad de los reportes', () => {
    it('el resumen, los periodos y las categorías suman lo mismo; el ticket promedio cuadra', async () => {
        const rango = `fechaDesde=2020-01-01&fechaHasta=${hoy}`;
        const resumen = datos<Resumen>(
            await comoAdmin(request(app).get(`/api/v1/reportes/resumen?${rango}`)).expect(200),
        );
        const meses = datos<{ ventaNeta: number; pedidos: number }[]>(
            await comoAdmin(request(app).get(`/api/v1/reportes/ventas?${rango}&agrupacion=MES`)).expect(200),
        );
        const categorias = datos<{ ventaNeta: number; porcentaje: number }[]>(
            await comoAdmin(request(app).get(`/api/v1/reportes/ventas-por-categoria?${rango}`)).expect(200),
        );
        const top = datos<{ posicion: number; unidades: number }[]>(
            await comoAdmin(request(app).get(`/api/v1/reportes/top-productos?${rango}`)).expect(200),
        );

        expect(resumen.pedidos).toBeGreaterThan(0); // la semilla tiene ventas
        expect(suma(meses)).toBe(centavos(resumen.ventaNeta));
        expect(meses.reduce((t, m) => t + m.pedidos, 0)).toBe(resumen.pedidos);
        expect(suma(categorias)).toBe(centavos(resumen.ventaNeta));
        // Cada porcentaje se redondea a 2 decimales: la suma puede desviarse hasta 0,005 por categoría.
        const desviacion = Math.abs(categorias.reduce((t, c) => t + c.porcentaje, 0) - 100);
        expect(desviacion).toBeLessThanOrEqual(categorias.length * 0.005 + 1e-9);
        expect(resumen.ticketPromedio).toBeCloseTo(resumen.ventaNeta / resumen.pedidos, 2);
        expect(top.length).toBeLessThanOrEqual(10);
        expect(top.map((t) => t.posicion)).toEqual(top.map((_, i) => i + 1));
        expect(top.map((t) => t.unidades)).toEqual([...top.map((t) => t.unidades)].sort((a, b) => b - a));
    });

    it('por día la serie no tiene huecos: una fila por cada día del rango', async () => {
        const dias = datos<{ periodo: string }[]>(
            await comoAdmin(
                request(app).get('/api/v1/reportes/ventas?fechaDesde=2026-10-01&fechaHasta=2026-10-31&agrupacion=DIA'),
            ).expect(200),
        );
        expect(dias).toHaveLength(31);
        expect(dias[0]?.periodo).toBe('2026-10-01');
        expect(dias[30]?.periodo).toBe('2026-10-31');
    });

    it('una venta nueva vacía el caché y suma exactamente su mercadería (sin envío)', async () => {
        const url = `/api/v1/reportes/resumen?fechaDesde=${hoy}&fechaHasta=${hoy}`;
        const primero = await comoAdmin(request(app).get(url)).expect(200);
        const antes = datos<Resumen>(primero);
        expect((await comoAdmin(request(app).get(url)).expect(200)).headers['x-cache']).toBe('HIT');

        const pedido = await comprar(37.5, 2);

        const despues = await comoAdmin(request(app).get(url)).expect(200);
        expect(despues.headers['x-cache']).toBe('MISS');
        const ahora = datos<Resumen>(despues);
        expect(ahora.pedidos).toBe(antes.pedidos + 1);
        expect(ahora.unidades).toBe(antes.unidades + 2);
        expect(centavos(ahora.ventaNeta) - centavos(antes.ventaNeta)).toBe(
            centavos(pedido.subtotal) - centavos(pedido.descuento),
        );
        expect((despues.body as { meta: { generadoEn: string } }).meta.generadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('un movimiento de inventario también vacía el caché; una consulta o un error no lo vacían', async () => {
        const producto = await crearProducto(app, admin, { existencia: 1 });
        const url = `/api/v1/reportes/resumen?fechaDesde=${hoy}&fechaHasta=${hoy}`;
        await comoAdmin(request(app).get(url)).expect(200);
        await comoAdmin(request(app).get('/api/v1/inventario/existencias')).expect(200);
        await comoAdmin(request(app).post('/api/v1/inventario/movimientos')).send({ tipo: 'X' }).expect(400);
        expect((await comoAdmin(request(app).get(url)).expect(200)).headers['x-cache']).toBe('HIT');

        await comoAdmin(request(app).post('/api/v1/inventario/movimientos'))
            .send({ tipo: 'ENTRADA_COMPRA', lineas: [{ idVariante: producto.idVariante, cantidad: 3 }] })
            .expect(201);
        expect((await comoAdmin(request(app).get(url)).expect(200)).headers['x-cache']).toBe('MISS');
    });

    it('fechas: día inexistente (400), rango invertido (422) y más de 366 días por día (422)', async () => {
        await comoAdmin(
            request(app).get('/api/v1/reportes/resumen?fechaDesde=2026-02-30&fechaHasta=2026-03-01'),
        ).expect(400);
        await comoAdmin(request(app).get('/api/v1/reportes/resumen?fechaDesde=2026-01-01')).expect(400);
        const invertido = await comoAdmin(
            request(app).get('/api/v1/reportes/resumen?fechaDesde=2026-03-01&fechaHasta=2026-01-01'),
        ).expect(422);
        expect(codigoError(invertido)).toBe('RANGO_FECHAS_INVALIDO');
        const excedido = await comoAdmin(
            request(app).get('/api/v1/reportes/ventas?fechaDesde=2024-01-01&fechaHasta=2026-01-01&agrupacion=DIA'),
        ).expect(422);
        expect(codigoError(excedido)).toBe('RANGO_FECHAS_EXCEDIDO');
    });

    it('carritos abandonados paginados; solo el administrador ve los reportes', async () => {
        const respuesta = await comoAdmin(
            request(app).get('/api/v1/reportes/carritos-abandonados?tamanoPagina=5'),
        ).expect(200);
        expect(respuesta.body).toMatchObject({ meta: { pagina: 1, tamanoPagina: 5 } });
        await request(app)
            .get(`/api/v1/reportes/resumen?fechaDesde=${hoy}&fechaHasta=${hoy}`)
            .set('Authorization', `Bearer ${operador.token}`)
            .expect(403);
        await request(app).get(`/api/v1/reportes/resumen?fechaDesde=${hoy}&fechaHasta=${hoy}`).expect(401);
    });
});

const binario = (prueba: request.Test) =>
    prueba.buffer(true).parse((res, listo) => {
        const partes: Buffer[] = [];
        res.on('data', (parte: Buffer) => partes.push(parte));
        res.on('end', () => {
            listo(null, Buffer.concat(partes));
        });
    });

describe('exportaciones', () => {
    it('Excel del reporte de ventas: una hoja por sección y los mismos números que el resumen', async () => {
        const rango = `fechaDesde=2026-10-01&fechaHasta=${hoy}`;
        const resumen = datos<Resumen>(
            await comoAdmin(request(app).get(`/api/v1/reportes/resumen?${rango}`)).expect(200),
        );
        const respuesta = await binario(
            comoAdmin(request(app).get(`/api/v1/reportes/exportar?${rango}&agrupacion=SEMANA&formato=xlsx`)),
        ).expect(200);
        expect(respuesta.headers['content-type']).toContain('spreadsheetml');
        expect(respuesta.headers['content-disposition']).toBe(
            `attachment; filename="shopcart-ventas-2026-10-01_${hoy}.xlsx"`,
        );

        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(respuesta.body as ArrayBuffer);
        expect(libro.worksheets.map((h) => h.name)).toEqual([
            'Indicadores',
            'Ventas por semana',
            'Ventas por categoría',
            'Top 10 productos',
            'Existencia baja',
        ]);
        const indicadores = libro.getWorksheet('Indicadores');
        expect(indicadores?.getCell('A2').value).toBe('Ventas netas');
        expect(indicadores?.getCell('B2').value).toBe(resumen.ventaNeta);
        expect(indicadores?.getCell('B3').value).toBe(resumen.pedidos);
        // Existencia baja: tantas filas como variantes cuenta el resumen.
        expect((libro.getWorksheet('Existencia baja')?.actualRowCount ?? 0) - 1).toBe(resumen.variantesExistenciaBaja);
    });

    it('PDF del reporte de ventas y de carritos abandonados', async () => {
        const ventas = await binario(
            comoAdmin(
                request(app).get(`/api/v1/reportes/exportar?fechaDesde=2026-10-01&fechaHasta=${hoy}&formato=pdf`),
            ),
        ).expect(200);
        expect(ventas.headers['content-type']).toBe('application/pdf');
        expect((ventas.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
        const carritos = await binario(
            comoAdmin(request(app).get('/api/v1/reportes/carritos-abandonados/exportar?formato=pdf')),
        ).expect(200);
        expect((carritos.body as Buffer).subarray(-6).toString()).toContain('%%EOF');
    });

    it('un filtro inválido responde el error JSON, no un archivo', async () => {
        const respuesta = await comoAdmin(
            request(app).get('/api/v1/reportes/exportar?fechaDesde=2026-03-01&fechaHasta=2026-01-01'),
        ).expect(422);
        expect(respuesta.headers['content-type']).toContain('application/json');
        expect(respuesta.headers['content-disposition']).toBeUndefined();
        await comoAdmin(
            request(app).get(`/api/v1/reportes/exportar?fechaDesde=${hoy}&fechaHasta=${hoy}&formato=csv`),
        ).expect(400);
    });
});

interface Parametro {
    clave: string;
    valor: string;
    versionFila: string;
    valorMinimo: number | null;
    valorMaximo: number | null;
}

describe('parámetros y bitácora', () => {
    it('editar con versión, rango y concurrencia; el cambio vacía el caché y queda en la bitácora', async () => {
        const lista = datos<Parametro[]>(await comoAdmin(request(app).get('/api/v1/parametros')).expect(200));
        expect(lista.map((p) => p.clave)).toEqual(
            expect.arrayContaining(['MINUTOS_RESERVA', 'TASA_IVA', 'EXISTENCIA_MINIMA']),
        );
        const original = datos<Parametro>(
            await comoAdmin(request(app).get('/api/v1/parametros/EXISTENCIA_MINIMA')).expect(200),
        );
        const nuevo = String(Number(original.valor) + 1);

        const url = `/api/v1/reportes/resumen?fechaDesde=${hoy}&fechaHasta=${hoy}`;
        await comoAdmin(request(app).get(url)).expect(200);
        expect((await comoAdmin(request(app).get(url)).expect(200)).headers['x-cache']).toBe('HIT');

        const fueraDeRango = await comoAdmin(request(app).put('/api/v1/parametros/EXISTENCIA_MINIMA'))
            .send({ valor: 5000, versionFila: original.versionFila })
            .expect(422);
        expect(codigoError(fueraDeRango)).toBe('VALOR_PARAMETRO_INVALIDO');

        const cambiado = datos<Parametro>(
            await comoAdmin(request(app).put('/api/v1/parametros/EXISTENCIA_MINIMA'))
                .send({ valor: nuevo, versionFila: original.versionFila })
                .expect(200),
        );
        try {
            expect(cambiado.valor).toBe(nuevo);
            const conflicto = await comoAdmin(request(app).put('/api/v1/parametros/EXISTENCIA_MINIMA'))
                .send({ valor: original.valor, versionFila: original.versionFila })
                .expect(409);
            expect(codigoError(conflicto)).toBe('EDICION_CONCURRENTE');

            // El caché se vació y el resumen ya usa el valor nuevo.
            const resumen = await comoAdmin(request(app).get(url)).expect(200);
            expect(resumen.headers['x-cache']).toBe('MISS');
            expect(datos<Resumen>(resumen).existenciaMinima).toBe(Number(nuevo));

            const bitacora = datos<{ entidad: string; accion: string; valorAnterior: unknown; valorNuevo: unknown }[]>(
                await comoAdmin(
                    request(app).get(
                        `/api/v1/bitacora?modulo=CONFIGURACION&fechaDesde=${hoy}&fechaHasta=${hoy}&tamanoPagina=5`,
                    ),
                ).expect(200),
            );
            expect(bitacora[0]).toMatchObject({ accion: 'MODIFICAR' });
            expect(JSON.stringify(bitacora[0]?.valorAnterior)).toContain(original.valor);
            expect(JSON.stringify(bitacora[0]?.valorNuevo)).toContain(nuevo);
        } finally {
            await comoAdmin(request(app).put('/api/v1/parametros/EXISTENCIA_MINIMA'))
                .send({ valor: original.valor, versionFila: cambiado.versionFila })
                .expect(200);
        }
    });

    it('parámetro inexistente (404), clave mal formada (400) y solo el administrador', async () => {
        expect(codigoError(await comoAdmin(request(app).get('/api/v1/parametros/NO_EXISTE')).expect(404))).toBe(
            'PARAMETRO_NO_ENCONTRADO',
        );
        await comoAdmin(request(app).get('/api/v1/parametros/minusculas')).expect(400);
        await request(app).get('/api/v1/parametros').set('Authorization', `Bearer ${operador.token}`).expect(403);
        await request(app).get('/api/v1/bitacora').set('Authorization', `Bearer ${operador.token}`).expect(403);
    });

    it('bitácora: filtros validados y exportación a Excel', async () => {
        await comoAdmin(request(app).get('/api/v1/bitacora?modulo=OTRO')).expect(400);
        expect(codigoError(await comoAdmin(request(app).get('/api/v1/bitacora?idEntidad=5')).expect(422))).toBe(
            'PARAMETRO_REQUERIDO',
        );
        const respuesta = await binario(
            comoAdmin(request(app).get('/api/v1/bitacora/exportar?modulo=CONFIGURACION')),
        ).expect(200);
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(respuesta.body as ArrayBuffer);
        const hoja = libro.getWorksheet('Bitácora');
        expect(hoja?.getRow(1).values).toEqual(expect.arrayContaining(['Fecha', 'Módulo', 'Valor anterior']));
        expect(hoja?.getCell('E2').text).toBe('CONFIGURACION');
    });
});

/* --- Dashboard en tiempo real por HTTP real ------------------------------------------------- */

interface EventoSse {
    evento: string;
    datos: unknown;
}

/** Conexión SSE con fetch (como el frontend): junta los eventos recibidos. */
async function conectarSse(base: string, token: string) {
    const control = new AbortController();
    const respuesta = await fetch(`${base}/api/v1/reportes/tiempo-real`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: control.signal,
    });
    const eventos: EventoSse[] = [];
    if (respuesta.body) {
        const lector = respuesta.body.pipeThrough(new TextDecoderStream()).getReader();
        let pendiente = '';
        void (async () => {
            try {
                for (;;) {
                    const { value, done } = await lector.read();
                    if (done) return;
                    pendiente += value;
                    const bloques = pendiente.split('\n\n');
                    pendiente = bloques.pop() ?? '';
                    for (const bloque of bloques) {
                        const evento = /^event: (.+)$/m.exec(bloque)?.[1];
                        const dato = /^data: (.+)$/m.exec(bloque)?.[1];
                        if (evento && dato) eventos.push({ evento, datos: JSON.parse(dato) as unknown });
                    }
                }
            } catch {
                /* conexión cancelada */
            }
        })();
    }
    const esperar = async (evento: string, cuantos = 1) => {
        for (let i = 0; i < 100; i += 1) {
            if (eventos.filter((e) => e.evento === evento).length >= cuantos) return;
            await new Promise((resolver) => setTimeout(resolver, 50));
        }
        throw new Error(`No llegó el evento ${evento}`);
    };
    return {
        respuesta,
        eventos,
        esperar,
        cerrar: () => {
            control.abort();
        },
    };
}

describe('dashboard en tiempo real (SSE)', () => {
    let servidor: ReturnType<typeof app.listen>;
    let base: string;

    beforeAll(async () => {
        servidor = app.listen(0);
        await new Promise((resolver) => servidor.once('listening', resolver));
        base = `http://127.0.0.1:${String((servidor.address() as AddressInfo).port)}`;
    });
    afterAll(async () => {
        servicios.cerrar();
        await new Promise((resolver) => servidor.close(resolver));
    });

    it('envía el estado al conectar y, tras una venta, el aviso y los números nuevos; al desconectar no quedan oyentes', async () => {
        const suscriptoresBase = servicios.eventos.suscriptores();
        const sse = await conectarSse(base, admin.token);
        expect(sse.respuesta.status).toBe(200);
        expect(sse.respuesta.headers.get('content-type')).toContain('text/event-stream');
        await sse.esperar('resumen');
        const inicial = sse.eventos[0]?.datos as { hoy: string; resumen: Resumen; ultimosPedidos: unknown[] };
        expect(inicial.hoy).toBe(hoy);
        expect(servicios.eventos.suscriptores()).toBe(suscriptoresBase + 1);

        const pedido = await comprar(55, 1);
        await sse.esperar('venta');
        await sse.esperar('resumen', 2);
        expect(sse.eventos.find((e) => e.evento === 'venta')?.datos).toMatchObject({
            numeroPedido: pedido.numeroPedido,
        });
        const actualizado = sse.eventos.filter((e) => e.evento === 'resumen').at(-1)?.datos as { resumen: Resumen };
        expect(actualizado.resumen.pedidos).toBe(inicial.resumen.pedidos + 1);

        sse.cerrar();
        for (let i = 0; i < 40 && servicios.reportes.tiempoReal.totalConexiones > 0; i += 1) {
            await new Promise((resolver) => setTimeout(resolver, 50));
        }
        expect(servicios.reportes.tiempoReal.totalConexiones).toBe(0);
        expect(servicios.reportes.tiempoReal.activo).toBe(false);
        expect(servicios.eventos.suscriptores()).toBe(suscriptoresBase);
    });

    it('sin token 401, operador 403 y la cuarta conexión del mismo usuario 429', async () => {
        expect((await fetch(`${base}/api/v1/reportes/tiempo-real`)).status).toBe(401);
        const comoOperador = await fetch(`${base}/api/v1/reportes/tiempo-real`, {
            headers: { Authorization: `Bearer ${operador.token}` },
        });
        expect(comoOperador.status).toBe(403);

        const abiertas = await Promise.all([1, 2, 3].map(() => conectarSse(base, admin.token)));
        const cuarta = await fetch(`${base}/api/v1/reportes/tiempo-real`, {
            headers: { Authorization: `Bearer ${admin.token}` },
        });
        expect(cuarta.status).toBe(429);
        for (const sse of abiertas) sse.cerrar();
    });
});
