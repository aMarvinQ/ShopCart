import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { pino } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheMemoria } from '../../src/cache/cacheMemoria.js';
import { EventosNegocio } from '../../src/eventos/eventosNegocio.js';
import { hoyGuatemala, paginado, type Documento } from '../../src/exportes/documento.js';
import { escribirExcel } from '../../src/exportes/excel.js';
import { escribirPdf } from '../../src/exportes/pdf.js';
import { CentroTiempoReal } from '../../src/modules/reportes/tiempoReal.js';

const logger = pino({ level: 'silent' });

afterEach(() => {
    vi.useRealTimers();
});

describe('caché de reportes', () => {
    it('vence, comparte la consulta en curso y no guarda errores', async () => {
        let ahora = 0;
        const cache = new CacheMemoria<number>(1000, 10, () => ahora);
        const calcular = vi.fn(() => Promise.resolve(7));

        const [a, b] = await Promise.all([cache.obtener('k', calcular), cache.obtener('k', calcular)]);
        expect(calcular).toHaveBeenCalledTimes(1); // dos peticiones simultáneas, una consulta
        expect([a.desdeCache, b.desdeCache]).toEqual([false, true]);

        ahora = 1001;
        expect((await cache.obtener('k', calcular)).desdeCache).toBe(false); // venció

        await expect(cache.obtener('e', () => Promise.reject(new Error('falla')))).rejects.toThrow('falla');
        expect((await cache.obtener('e', calcular)).desdeCache).toBe(false); // el error no quedó guardado
    });

    it('nunca pasa del tope: descarta la usada hace más tiempo', async () => {
        const cache = new CacheMemoria<string>(60_000, 3);
        for (const clave of ['a', 'b', 'c']) await cache.obtener(clave, () => Promise.resolve(clave));
        await cache.obtener('a', () => Promise.resolve('a')); // "a" pasa a ser la más reciente
        await cache.obtener('d', () => Promise.resolve('d'));
        expect(cache.tamano).toBe(3);
        expect((await cache.obtener('a', () => Promise.resolve('x'))).desdeCache).toBe(true);
        expect((await cache.obtener('b', () => Promise.resolve('x'))).desdeCache).toBe(false); // descartada
    });

    it('invalidar descarta todo, incluida una consulta en curso', async () => {
        const cache = new CacheMemoria<number>(60_000, 10);
        let resolver: (valor: number) => void = () => undefined;
        const enCurso = cache.obtener('k', () => new Promise<number>((r) => (resolver = r)));
        cache.invalidar();
        resolver(1);
        await enCurso;
        expect((await cache.obtener('k', () => Promise.resolve(2))).valor).toBe(2);
    });
});

describe('avisos de negocio', () => {
    it('suscribir devuelve con qué cancelar; un oyente que falla no afecta a los demás', () => {
        const eventos = new EventosNegocio();
        const recibido = vi.fn();
        const cancelarMalo = eventos.suscribir(() => {
            throw new Error('oyente roto');
        });
        const cancelar = eventos.suscribir(recibido);
        expect(eventos.suscriptores()).toBe(2);
        eventos.emitir({ tipo: 'CAMBIO', origen: 'prueba' });
        expect(recibido).toHaveBeenCalledTimes(1);
        cancelar();
        cancelarMalo();
        expect(eventos.suscriptores()).toBe(0);
    });

    it('el middleware avisa solo modificaciones exitosas de las rutas indicadas', () => {
        const eventos = new EventosNegocio();
        const recibido = vi.fn();
        eventos.suscribir(recibido);
        const middleware = eventos.avisarCambios(/^\/(productos)(?:\/|$)/);
        const probar = (method: string, path: string, statusCode: number) => {
            const res = Object.assign(new EventEmitter(), { statusCode });
            middleware({ method, path } as Request, res as unknown as Response, () => undefined);
            res.emit('finish');
        };
        probar('POST', '/productos', 201);
        probar('PATCH', '/productos/5/estado', 200);
        probar('POST', '/productos', 409); // falló: no cambió nada
        probar('GET', '/productos', 200); // lectura
        probar('POST', '/productos-destacados', 201); // otra ruta
        probar('POST', '/carrito/items', 200);
        expect(recibido).toHaveBeenCalledTimes(2);
        expect(recibido).toHaveBeenCalledWith({ tipo: 'CAMBIO', origen: 'productos' });
    });
});

const documento = (filas: Record<string, unknown>[]): Documento => ({
    titulo: 'Prueba',
    subtitulo: 'Subtítulo',
    indicadores: [{ etiqueta: 'Ventas', valor: 1234.5, tipo: 'moneda' }],
    secciones: [
        {
            titulo: 'Productos: top/10',
            columnas: [
                { titulo: 'Producto', clave: 'producto' },
                { titulo: 'Monto', clave: 'monto', tipo: 'moneda' },
                { titulo: 'Día', clave: 'dia', tipo: 'dia' },
            ],
            filas,
        },
    ],
});

async function generar(escribir: typeof escribirExcel, doc: Documento): Promise<Buffer> {
    const destino = new PassThrough();
    const partes: Buffer[] = [];
    destino.on('data', (parte: Buffer) => partes.push(parte));
    await escribir(doc, destino);
    await new Promise((resolver) => setImmediate(resolver));
    return Buffer.concat(partes);
}

describe('exportación', () => {
    it('Excel: hojas, tipos y formato; un texto que empieza con "=" nunca es fórmula', async () => {
        const archivo = await generar(
            escribirExcel,
            documento([{ producto: '=HYPERLINK("http://malo","clic")', monto: 99.9, dia: '2026-11-02' }]),
        );
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(archivo as unknown as ArrayBuffer);
        expect(libro.worksheets.map((h) => h.name)).toEqual(['Indicadores', 'Productos  top 10']);
        const hoja = libro.getWorksheet('Productos  top 10');
        const celda = hoja?.getCell('A2');
        expect(celda?.type).not.toBe(ExcelJS.ValueType.Formula);
        expect(celda?.text).toBe('=HYPERLINK("http://malo","clic")');
        expect(hoja?.getCell('B2').value).toBe(99.9);
        expect(hoja?.getCell('B2').numFmt).toBe('"Q"#,##0.00');
        expect((hoja?.getCell('C2').value as Date).toISOString()).toBe('2026-11-02T00:00:00.000Z');
        expect(libro.getWorksheet('Indicadores')?.getCell('B2').value).toBe(1234.5);
    });

    it('PDF válido aun con muchas filas (varias páginas)', async () => {
        const filas = Array.from({ length: 120 }, (_, i) => ({
            producto: `Producto ${String(i)}`,
            monto: i,
            dia: '2026-11-02',
        }));
        const archivo = await generar(escribirPdf, documento(filas));
        expect(archivo.subarray(0, 5).toString()).toBe('%PDF-');
        expect(archivo.subarray(-6).toString()).toContain('%%EOF');
        expect(archivo.toString('latin1').match(/\/Type \/Page\b/g)?.length).toBeGreaterThan(1);
    });

    it('paginado: trae página por página hasta el tope e informa si hubo más', async () => {
        const obtener = vi.fn((pagina: number, tamano: number) =>
            Promise.resolve({
                filas: Array.from({ length: tamano }, (_, i) => ({ n: (pagina - 1) * tamano + i })),
                total: 1000,
            }),
        );
        const { filas, nota } = await paginado(obtener, 250);
        const leidas: unknown[] = [];
        for await (const fila of filas) leidas.push(fila);
        expect(leidas).toHaveLength(250);
        expect(obtener).toHaveBeenCalledTimes(3); // 100 + 100 + 50: no pide páginas de más
        expect(nota()).toContain('250');
    });

    it('hoy en Guatemala (UTC−6)', () => {
        expect(hoyGuatemala(new Date('2026-11-03T05:59:00Z'))).toBe('2026-11-02');
        expect(hoyGuatemala(new Date('2026-11-03T06:00:00Z'))).toBe('2026-11-03');
    });
});

/* --- Tiempo real con petición y respuesta simuladas --------------------------------------- */

class RespuestaFalsa extends EventEmitter {
    escrito = '';
    writableEnded = false;
    destroyed = false;
    writableLength = 0;
    status() {
        return this;
    }
    setHeader() {
        return this;
    }
    flushHeaders() {
        /* sin efecto */
    }
    write(texto: string) {
        this.escrito += texto;
        return true;
    }
    end() {
        this.writableEnded = true;
        this.emit('close');
        return this;
    }
    destroy() {
        this.destroyed = true;
        this.emit('close');
        return this;
    }
}

function conexionFalsa() {
    const req = new EventEmitter();
    const res = new RespuestaFalsa();
    res.on('close', () => req.emit('close'));
    return { req: req as unknown as Request, res, resExpress: res as unknown as Response };
}

describe('centro de tiempo real (SSE)', () => {
    it('sin fugas: se suscribe con la primera conexión y libera todo al cerrarse la última', async () => {
        const eventos = new EventosNegocio();
        const centro = new CentroTiempoReal(eventos, () => Promise.resolve({ ok: true }), logger);
        const a = conexionFalsa();
        const b = conexionFalsa();
        await centro.conectar(a.req, a.resExpress, { id: 1, rol: 'ADMIN' });
        await centro.conectar(b.req, b.resExpress, { id: 2, rol: 'ADMIN' });
        expect(eventos.suscriptores()).toBe(1);
        expect(a.res.escrito).toContain('event: resumen');

        a.req.emit('close');
        expect(centro.activo).toBe(true);
        b.req.emit('close');
        expect(centro.totalConexiones).toBe(0);
        expect(centro.activo).toBe(false);
        expect(eventos.suscriptores()).toBe(0);
    });

    it('agrupa los avisos: muchos en el mismo segundo producen un solo recálculo; cada venta se avisa una vez', async () => {
        vi.useFakeTimers();
        const eventos = new EventosNegocio();
        const instantanea = vi.fn(() => Promise.resolve({ ok: true }));
        const centro = new CentroTiempoReal(eventos, instantanea, logger, { agrupacionMs: 1000 });
        const c = conexionFalsa();
        await centro.conectar(c.req, c.resExpress, { id: 1, rol: 'ADMIN' });
        instantanea.mockClear();

        for (let i = 0; i < 20; i += 1) eventos.emitir({ tipo: 'CAMBIO', origen: 'prueba' });
        eventos.emitir({ tipo: 'VENTA', idPedido: 9, numeroPedido: 'SC-000009', total: 10 });
        eventos.emitir({ tipo: 'VENTA', idPedido: 9, numeroPedido: 'SC-000009', total: 10 }); // pago repetido
        await vi.advanceTimersByTimeAsync(1000);
        expect(instantanea).toHaveBeenCalledTimes(1);
        expect(c.res.escrito.match(/event: venta/g)).toHaveLength(1);
        centro.cerrarTodo();
        expect(centro.activo).toBe(false);
    });

    it('latido periódico, cierre al vencer el token y límite de conexiones por usuario', async () => {
        vi.useFakeTimers();
        const centro = new CentroTiempoReal(new EventosNegocio(), () => Promise.resolve({}), logger, {
            latidoMs: 25_000,
            maximoPorUsuario: 2,
        });
        const usuario = { id: 1, rol: 'ADMIN' as const, expiraEn: Date.now() + 60_000 };
        const a = conexionFalsa();
        await centro.conectar(a.req, a.resExpress, usuario);
        await centro.conectar(conexionFalsa().req, conexionFalsa().resExpress, usuario);
        await expect(centro.conectar(conexionFalsa().req, conexionFalsa().resExpress, usuario)).rejects.toMatchObject({
            estado: 429,
            codigo: 'DEMASIADAS_CONEXIONES',
        });

        await vi.advanceTimersByTimeAsync(25_000);
        expect(a.res.escrito).toContain(': latido');
        await vi.advanceTimersByTimeAsync(35_000);
        expect(a.res.escrito).toContain('event: sesion-expirada');
        expect(a.res.writableEnded).toBe(true);
        centro.cerrarTodo();
        expect(centro.activo).toBe(false);
    });

    it('un cliente que no lee se desconecta en lugar de acumular memoria', async () => {
        const eventos = new EventosNegocio();
        const centro = new CentroTiempoReal(eventos, () => Promise.resolve({}), logger, {
            maximoPendienteBytes: 10,
        });
        const c = conexionFalsa();
        await centro.conectar(c.req, c.resExpress, { id: 1, rol: 'ADMIN' });
        c.res.writableLength = 11; // el cliente dejó de leer
        eventos.emitir({ tipo: 'VENTA', idPedido: 1, numeroPedido: 'SC-000001', total: 1 });
        expect(c.res.destroyed).toBe(true);
        expect(centro.totalConexiones).toBe(0);
        expect(centro.activo).toBe(false);
    });

    it('un administrador desactivado (PERMISO_DENEGADO) recibe sin-permiso y se cierra su conexión', async () => {
        const error = Object.assign(new Error('PERMISO_DENEGADO'), { number: 50201 });
        const centro = new CentroTiempoReal(new EventosNegocio(), () => Promise.reject(error), logger);
        const c = conexionFalsa();
        await centro.conectar(c.req, c.resExpress, { id: 1, rol: 'ADMIN' });
        expect(c.res.escrito).toContain('event: sin-permiso');
        expect(centro.totalConexiones).toBe(0);
        expect(centro.activo).toBe(false);
    });
});
