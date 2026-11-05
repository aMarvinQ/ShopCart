import { describe, expect, it } from 'vitest';
import type { VarianteDeProducto } from './hooks/useCatalogo';
import { gruposDeAtributos, varianteAlElegir } from './variantes';

const atributo = (idAtributo: number, idAtributoValor: number, valor: string) => ({
    idAtributo,
    atributo: idAtributo === 1 ? 'Color' : 'Talla',
    ordenAtributo: idAtributo,
    idAtributoValor,
    valor,
    ordenValor: idAtributoValor,
    codigoHex: null,
});
const variante = (idVariante: number, disponible: number, color: [number, string], talla: [number, string]) =>
    ({
        idVariante,
        sku: `S${String(idVariante)}`,
        precio: 10,
        disponible,
        esSeleccionInicial: idVariante === 1,
        atributos: [atributo(1, ...color), atributo(2, ...talla)],
    }) satisfies VarianteDeProducto;

const NEGRO: [number, string] = [10, 'Negro'];
const ROJO: [number, string] = [11, 'Rojo'];
const S: [number, string] = [20, 'S'];
const M: [number, string] = [21, 'M'];
const VARIANTES = [variante(1, 5, NEGRO, S), variante(2, 0, NEGRO, M), variante(3, 2, ROJO, M)];

describe('selección de variantes', () => {
    it('marca sin existencia lo que no se puede comprar con lo ya elegido', () => {
        const [, tallas] = gruposDeAtributos(VARIANTES, VARIANTES[0] as VarianteDeProducto);
        expect(tallas?.valores.map((v) => [v.valor, v.conExistencia])).toEqual([
            ['S', true],
            ['M', false],
        ]);
    });

    it('conserva lo demás si la combinación existe; si no, va a una que exista', () => {
        const negroS = VARIANTES[0] as VarianteDeProducto;
        expect(varianteAlElegir(VARIANTES, negroS, 2, 21).idVariante).toBe(2);
        expect(varianteAlElegir(VARIANTES, negroS, 1, 11).idVariante).toBe(3);
    });
});
