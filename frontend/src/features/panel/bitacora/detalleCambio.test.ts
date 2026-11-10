import { describe, expect, it } from 'vitest';
import { camposCambiados, nombreRegistro, resumenCambio } from './detalleCambio';

describe('detalle de un cambio de la bitácora', () => {
    it('muestra solo lo que cambió, con nombres y valores legibles, sin datos de contexto vacíos', () => {
        expect(resumenCambio({ estado: 'PAGADO' }, { estado: 'EN_PREPARACION', comentario: null })).toBe(
            'Estado: Pagado → En preparación',
        );
        expect(resumenCambio({ nombre: 'A', costo: 30 }, { nombre: 'A', costo: 35.5 })).toBe('Costo: Q30.00 → Q35.50');
    });

    it('en una creación lista los datos nuevos sin los IDs técnicos', () => {
        const campos = camposCambiados(null, { idCupon: 9, codigo: 'VERANO', activo: true });
        expect(campos.map((c) => [c.etiqueta, c.anterior, c.nuevo])).toEqual([
            ['Código', undefined, 'VERANO'],
            ['Activo', undefined, 'Sí'],
        ]);
    });

    it('resume cuando son muchos campos y avisa si no cambió nada', () => {
        expect(resumenCambio(null, { nombre: 'X', slug: 'x', descripcion: null, activo: false })).toBe(
            'Nombre: X · Slug: x · +2 más',
        );
        expect(resumenCambio({ precio: 90 }, { precio: 90 })).toBe('Sin cambios en los datos');
    });

    it('nombra el registro con el dato más reconocible', () => {
        expect(nombreRegistro(null, { idVariante: 1, sku: 'PRU-GRI-S', precio: 21 })).toBe('PRU-GRI-S');
        expect(nombreRegistro({ nombre: 'Ana', apellido: 'Ruiz' }, { nombre: 'Ana', telefono: '5555' })).toBe(
            'Ana Ruiz',
        );
        expect(nombreRegistro({ activo: true }, { activo: false })).toBeNull();
    });
});
