import { describe, expect, it } from 'vitest';
import { formatearTelefono, PATRON_TELEFONO } from './telefono';

describe('teléfono', () => {
    it('deja 8 dígitos con el guion, sin letras, espacios ni el código del país', () => {
        expect(formatearTelefono('5555')).toBe('5555');
        expect(formatearTelefono('55551')).toBe('5555-1');
        expect(formatearTelefono('5a5 55-1234999')).toBe('5555-1234');
        expect(formatearTelefono('+502 5555 1234')).toBe('5555-1234');
    });

    it('acepta 8 dígitos con o sin guion', () => {
        expect(['5555-1234', '55551234'].every((t) => PATRON_TELEFONO.test(t))).toBe(true);
        expect(['5555-123', '123456789', '+50255551234'].some((t) => PATRON_TELEFONO.test(t))).toBe(false);
    });
});
