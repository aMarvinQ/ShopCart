import { pino } from 'pino';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { programarTarea } from '../../src/jobs/programador.js';
import { ocultarCredencialesUrl } from '../../src/middlewares/registroPeticiones.js';

const logger = pino({ level: 'silent' });

afterEach(() => {
    vi.useRealTimers();
});

describe('tareas programadas', () => {
    it('nunca se encima: si la anterior sigue en curso, la siguiente se omite', async () => {
        let terminar: () => void = () => undefined;
        const tarea = vi.fn(() => new Promise<void>((resolver) => (terminar = resolver)));
        const programada = programarTarea('prueba', 1000, tarea, logger);

        const primera = programada.ejecutar();
        const segunda = programada.ejecutar(); // en curso: no inicia otra
        expect(tarea).toHaveBeenCalledTimes(1);
        terminar();
        await Promise.all([primera, segunda]);

        const tercera = programada.ejecutar(); // la anterior ya terminó: sí inicia
        expect(tarea).toHaveBeenCalledTimes(2);
        terminar();
        await tercera;
        await programada.detener();
    });

    it('un error queda en el log y no detiene las siguientes ejecuciones', async () => {
        const error = vi.spyOn(logger, 'error');
        const tarea = vi.fn().mockRejectedValueOnce(new Error('base caída')).mockResolvedValue(undefined);
        const programada = programarTarea('prueba', 1000, tarea, logger);
        await programada.ejecutar();
        await programada.ejecutar();
        expect(tarea).toHaveBeenCalledTimes(2);
        expect(error).toHaveBeenCalledTimes(1);
        await programada.detener();
    });

    it('se ejecuta con el intervalo y detener() cancela las siguientes', async () => {
        vi.useFakeTimers();
        const tarea = vi.fn(() => Promise.resolve());
        const programada = programarTarea('prueba', 60_000, tarea, logger);
        await vi.advanceTimersByTimeAsync(180_000);
        expect(tarea).toHaveBeenCalledTimes(3);
        await programada.detener();
        await vi.advanceTimersByTimeAsync(180_000);
        expect(tarea).toHaveBeenCalledTimes(3);
    });
});

describe('logs sin credenciales', () => {
    it('el token del enlace de seguimiento no se escribe en la URL registrada', () => {
        expect(ocultarCredencialesUrl('/api/v1/seguimiento/abcDEF_123-xyz?x=1')).toBe(
            '/api/v1/seguimiento/[OCULTO]?x=1',
        );
        expect(ocultarCredencialesUrl('/api/v1/pedidos/5')).toBe('/api/v1/pedidos/5');
    });
});
