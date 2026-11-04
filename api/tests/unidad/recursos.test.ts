import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import type { Request, Response } from 'express';
import { pino } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expirarCheckoutsVencidos } from '../../src/jobs/expirarCheckouts.js';
import { esperarCliente, type Documento, type Fila } from '../../src/exportes/documento.js';
import { enviarDocumento, exportacionesActivas } from '../../src/exportes/enviar.js';
import { PasarelaSimulada } from '../../src/pagos/pasarela.js';

/* Consumo de recursos: nada crece sin límite, ningún ciclo queda girando y todo cupo se libera. */

afterEach(() => {
    vi.useRealTimers();
});

describe('pasarela simulada', () => {
    it('el historial de movimientos no crece sin límite', async () => {
        const pasarela = new PasarelaSimulada();
        for (let i = 0; i < 1_100; i += 1) await pasarela.anular(`REF-${String(i)}`);
        const movimientos = pasarela.movimientos();
        expect(movimientos).toHaveLength(1_000);
        expect(movimientos.at(-1)?.referencia).toBe('REF-1099'); // conserva los más recientes
    });
});

describe('expiración de checkouts', () => {
    it('siempre termina: aunque el SP devuelva lotes llenos, para en el máximo de lotes', async () => {
        const expirar = vi.fn(() => Promise.resolve({ checkoutsExpirados: 1000, reservasLiberadas: 2000 }));
        const total = await expirarCheckoutsVencidos(expirar);
        expect(expirar).toHaveBeenCalledTimes(50);
        expect(total).toEqual({ checkoutsExpirados: 50_000, reservasLiberadas: 100_000 });
    });

    it('un lote incompleto termina la pasada', async () => {
        const expirar = vi
            .fn()
            .mockResolvedValueOnce({ checkoutsExpirados: 1000, reservasLiberadas: 1 })
            .mockResolvedValueOnce({ checkoutsExpirados: 3, reservasLiberadas: 1 });
        expect((await expirarCheckoutsVencidos(expirar)).checkoutsExpirados).toBe(1003);
        expect(expirar).toHaveBeenCalledTimes(2);
    });
});

/** Destino que no lee hasta que se le indica: su búfer se llena con el primer write. */
function destinoLento() {
    const pendientes: (() => void)[] = [];
    const destino = new Writable({
        highWaterMark: 1,
        write(_parte, _codificacion, listo) {
            pendientes.push(listo);
        },
    });
    return {
        destino,
        leer: () => {
            pendientes.splice(0).forEach((listo) => {
                listo();
            });
        },
    };
}

describe('control de flujo de la descarga', () => {
    it('sin presión no espera', async () => {
        const destino = new Writable({
            write: (_p, _c, listo) => {
                listo();
            },
        });
        await expect(esperarCliente(destino)).resolves.toBeUndefined();
    });

    it('espera a que el cliente lea y no deja oyentes ni temporizadores', async () => {
        const { destino, leer } = destinoLento();
        destino.write('x');
        expect(destino.writableNeedDrain).toBe(true);
        let continuo = false;
        const espera = esperarCliente(destino).then(() => (continuo = true));
        await new Promise((resolver) => setImmediate(resolver));
        expect(continuo).toBe(false);

        leer();
        await espera;
        expect(continuo).toBe(true);
        expect(destino.listenerCount('drain')).toBe(0);
        expect(destino.listenerCount('close')).toBe(0);
        expect(destino.listenerCount('error')).toBe(0);
    });

    it('si el cliente deja de leer, falla al vencer el tiempo; si se desconecta, continúa', async () => {
        vi.useFakeTimers();
        const lento = destinoLento();
        lento.destino.write('x');
        const espera = esperarCliente(lento.destino, 1000);
        const rechazo = expect(espera).rejects.toThrow('dejó de leer');
        await vi.advanceTimersByTimeAsync(1000);
        await rechazo;
        expect(lento.destino.listenerCount('drain')).toBe(0);

        const otro = destinoLento();
        otro.destino.write('x');
        const conexion = esperarCliente(otro.destino, 1000);
        otro.destino.emit('close');
        await expect(conexion).resolves.toBeUndefined();
    });
});

class RespuestaFalsa extends Writable {
    headersSent = false;
    status() {
        return this;
    }
    setHeader() {
        return this;
    }
    removeHeader() {
        return this;
    }
    override _write(_parte: unknown, _codificacion: string, listo: () => void) {
        this.headersSent = true;
        listo();
    }
}

function exportar(filas: AsyncIterable<Fila>) {
    const documento: Documento = {
        titulo: 'Prueba',
        subtitulo: 'Prueba',
        secciones: [{ titulo: 'Datos', columnas: [{ titulo: 'N', clave: 'n' }], filas }],
    };
    const req = Object.assign(new EventEmitter(), { log: pino({ level: 'silent' }) }) as unknown as Request;
    const res = new RespuestaFalsa();
    return { res, envio: enviarDocumento(req, res as unknown as Response, documento, 'prueba', 'pdf') };
}

describe('exportaciones simultáneas', () => {
    it('la cuarta responde 429 y el cupo se libera al terminar o si el cliente se desconecta', async () => {
        let soltar: () => void = () => undefined;
        const bloqueo = new Promise<void>((resolver) => (soltar = resolver));
        async function* filas(): AsyncGenerator<Fila> {
            yield { n: 1 };
            await bloqueo;
        }
        const inicial = exportacionesActivas();
        const uno = exportar(filas());
        const dos = exportar(filas());
        const tres = exportar(filas());
        expect(exportacionesActivas()).toBe(inicial + 3);

        await expect(exportar(filas()).envio).rejects.toMatchObject({
            estado: 429,
            codigo: 'DEMASIADAS_EXPORTACIONES',
        });
        expect(exportacionesActivas()).toBe(inicial + 3);

        // Un cliente que se desconecta libera su cupo aunque el escritor siga esperando datos.
        uno.res.destroy();
        await uno.envio;
        expect(exportacionesActivas()).toBe(inicial + 2);

        soltar();
        await Promise.all([dos.envio, tres.envio]);
        expect(exportacionesActivas()).toBe(inicial);
    });
});
