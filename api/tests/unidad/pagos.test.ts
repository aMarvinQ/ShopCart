import { describe, expect, it } from 'vitest';
import { PasarelaSimulada, TARJETAS_PRUEBA, type SolicitudCobro } from '../../src/pagos/pasarela.js';
import { cumpleLuhn, marcaDe, revisarTarjeta } from '../../src/pagos/tarjeta.js';

const tarjeta = (numero: string) => ({ numero, titular: 'PRUEBA', vencimiento: '12/30', cvv: '123' });
const solicitud = (clave: string, numero = '4242424242424242'): SolicitudCobro => ({
    claveIdempotencia: clave,
    monto: 100,
    descripcion: 'prueba',
    tarjeta: tarjeta(numero),
});

describe('validación de tarjetas', () => {
    it('Luhn: acepta números válidos y detecta un dígito cambiado', () => {
        expect(cumpleLuhn('4242424242424242')).toBe(true);
        expect(cumpleLuhn('4242424242424241')).toBe(false);
        expect(cumpleLuhn('79927398713')).toBe(true); // ejemplo clásico de ISO/IEC 7812
    });

    it('todas las tarjetas de prueba pasan Luhn y son Visa', () => {
        for (const numero of Object.keys(TARJETAS_PRUEBA)) {
            expect(cumpleLuhn(numero)).toBe(true);
            expect(marcaDe(numero)).toBe('VISA');
        }
    });

    it('marca por prefijo, incluido el rango 2221–2720 de Mastercard', () => {
        expect(marcaDe('4111111111111111')).toBe('VISA');
        expect(marcaDe('5105105105105100')).toBe('MASTERCARD');
        expect(marcaDe('2223003122003222')).toBe('MASTERCARD');
        expect(marcaDe('2721000000000000')).toBeNull();
        expect(marcaDe('378282246310005')).toBe('AMEX');
        expect(marcaDe('6011111111111117')).toBeNull();
    });

    it('vence al terminar el mes indicado', () => {
        const ahora = new Date(Date.UTC(2026, 10, 15)); // 15 nov 2026
        const vence = (vencimiento: string) =>
            revisarTarjeta({ numero: '4242424242424242', vencimiento, cvv: '123' }, ahora).map((p) => p.campo);
        expect(vence('11/26')).toEqual([]);
        expect(vence('10/26')).toEqual(['vencimiento']);
        expect(vence('00/27')).toEqual(['vencimiento']);
    });

    it('longitud según la marca y CVV de 4 dígitos en Amex', () => {
        expect(revisarTarjeta({ numero: '37828224631000', vencimiento: '12/30', cvv: '1234' })).toEqual([
            expect.objectContaining({ campo: 'numero' }),
        ]);
        expect(revisarTarjeta({ numero: '378282246310005', vencimiento: '12/30', cvv: '123' })).toEqual([
            expect.objectContaining({ campo: 'cvv' }),
        ]);
        expect(revisarTarjeta({ numero: '3782 8224 6310 005', vencimiento: '12/30', cvv: '1234' })).toEqual([]);
    });
});

describe('pasarela simulada', () => {
    it('misma clave = mismo cobro, aunque las peticiones lleguen a la vez', async () => {
        const pasarela = new PasarelaSimulada(5);
        const [a, b] = await Promise.all([pasarela.cobrar(solicitud('k1')), pasarela.cobrar(solicitud('k1'))]);
        expect(a).toEqual(b);
        expect(a).toMatchObject({ estado: 'APROBADO', marca: 'VISA', ultimos4: '4242' });
        expect(await pasarela.cobrar(solicitud('k1'))).toEqual(a);
        expect(pasarela.movimientos().filter((m) => m.tipo === 'COBRO')).toHaveLength(1);
        expect((await pasarela.cobrar(solicitud('k2'))).referencia).not.toBe(a.referencia);
    });

    it('las tarjetas de prueba se rechazan con su motivo y el rechazo no queda fijo para la clave', async () => {
        const pasarela = new PasarelaSimulada();
        const primero = await pasarela.cobrar(solicitud('r1', '4000000000009995'));
        expect(primero).toMatchObject({ estado: 'RECHAZADO', motivo: 'FONDOS_INSUFICIENTES', ultimos4: '9995' });
        const segundo = await pasarela.cobrar(solicitud('r1', '4000000000009995'));
        expect(segundo.referencia).not.toBe(primero.referencia); // otro intento ante el banco
        expect(pasarela.movimientos()).toEqual([]);
    });

    it('el resultado nunca incluye el número completo ni el CVV', async () => {
        const resultado = JSON.stringify(await new PasarelaSimulada().cobrar(solicitud('p1')));
        expect(resultado).not.toContain('4242424242424242');
        expect(resultado).not.toContain('"cvv"');
    });
});
