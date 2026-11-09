import { describe, expect, it } from 'vitest';
import { crearLectorSse } from './flujoSse';

describe('lector de Server-Sent Events', () => {
    it('arma un evento cortado en varios trozos de la red', () => {
        const leer = crearLectorSse();
        expect(leer('event: resumen\nda')).toEqual([]);
        expect(leer('ta: {"pedidos":3}\n')).toEqual([]);
        expect(leer('\n')).toEqual([{ evento: 'resumen', datos: '{"pedidos":3}' }]);
    });

    it('ignora el latido y la reconexión, y acepta varios eventos juntos y finales \\r\\n', () => {
        const leer = crearLectorSse();
        expect(
            leer('retry: 5000\n\n: latido\n\nevent: venta\r\ndata: {"total":10}\r\n\r\nevent: x\ndata: a\ndata: b\n\n'),
        ).toEqual([
            { evento: 'venta', datos: '{"total":10}' },
            { evento: 'x', datos: 'a\nb' },
        ]);
    });
});
