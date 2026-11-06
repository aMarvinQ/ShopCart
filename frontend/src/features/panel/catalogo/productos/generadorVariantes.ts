import { aSlug } from '../../../../utils/slug';

export interface ValorElegible {
    idAtributo: number;
    idAtributoValor: number;
    valor: string;
}

export interface Combinacion {
    clave: string;
    valores: ValorElegible[];
}

/** La API admite hasta 100 variantes por producto. */
export const MAXIMO_VARIANTES = 100;

/** Producto cartesiano de los valores elegidos, un valor por atributo. Sin atributos hay una sola variante. */
export function combinaciones(gruposElegidos: readonly (readonly ValorElegible[])[]): Combinacion[] {
    const grupos = gruposElegidos.filter((g) => g.length > 0);
    const total = grupos.reduce((producto, g) => producto * g.length, 1);
    if (total > MAXIMO_VARIANTES) return [];
    let resultado: ValorElegible[][] = [[]];
    for (const grupo of grupos) resultado = resultado.flatMap((parcial) => grupo.map((valor) => [...parcial, valor]));
    return resultado.map((valores) => ({ clave: valores.map((v) => v.idAtributoValor).join('-') || 'unica', valores }));
}

export const totalCombinaciones = (grupos: readonly (readonly unknown[])[]) =>
    grupos.filter((g) => g.length > 0).reduce((producto, g) => producto * g.length, 1);

const abreviar = (texto: string, largo: number) => aSlug(texto).replace(/-/g, '').slice(0, largo).toUpperCase();

/** Monto mayor que cero, con hasta 10 enteros y 2 decimales (FU_Catalogo_ValidarVariantes y la API). */
export const precioValido = (precio: string) => /^\d{1,10}(\.\d{1,2})?$/.test(precio.trim()) && Number(precio) > 0;

/** El SP guarda el SKU en mayúsculas: solo admite letras, dígitos y guiones, de 3 a 50 caracteres. */
export const skuValido = (sku: string) => /^[A-Z0-9-]{3,50}$/.test(sku.trim().toUpperCase());

/** "Playera básica" + Negro + M → PLA-NEG-M. Es una sugerencia: se puede cambiar. */
export function skuSugerido(nombre: string, valores: readonly ValorElegible[]): string {
    return [abreviar(nombre, 3) || 'SKU', ...valores.map((v) => abreviar(v.valor, 3))].filter(Boolean).join('-');
}
