import type { DetalleDeProducto, VarianteDeProducto } from './hooks/useCatalogo';

export interface ValorAtributo {
    idAtributoValor: number;
    valor: string;
    codigoHex: string | null;
    /** Hay existencia con este valor y lo ya elegido en los demás atributos. */
    conExistencia: boolean;
}

export interface GrupoAtributo {
    idAtributo: number;
    atributo: string;
    valores: ValorAtributo[];
}

const valorDe = (variante: VarianteDeProducto, idAtributo: number) =>
    variante.atributos.find((a) => a.idAtributo === idAtributo)?.idAtributoValor;

/** Coincide en este valor y en lo elegido para los demás atributos. */
const compatible = (variante: VarianteDeProducto, idAtributo: number, idValor: number, actual: VarianteDeProducto) =>
    variante.atributos.every((a) =>
        a.idAtributo === idAtributo
            ? a.idAtributoValor === idValor
            : a.idAtributoValor === valorDe(actual, a.idAtributo),
    );

/** Selectores del producto, en el orden de la API, marcando qué valores tienen existencia. */
export function gruposDeAtributos(
    variantes: readonly VarianteDeProducto[],
    actual: VarianteDeProducto,
): GrupoAtributo[] {
    const grupos = new Map<number, GrupoAtributo & { orden: number; ordenes: Map<number, number> }>();
    for (const variante of variantes) {
        for (const atributo of variante.atributos) {
            const grupo = grupos.get(atributo.idAtributo) ?? {
                idAtributo: atributo.idAtributo,
                atributo: atributo.atributo,
                valores: [],
                orden: atributo.ordenAtributo,
                ordenes: new Map<number, number>(),
            };
            grupos.set(atributo.idAtributo, grupo);
            if (!grupo.ordenes.has(atributo.idAtributoValor)) {
                grupo.ordenes.set(atributo.idAtributoValor, atributo.ordenValor);
                grupo.valores.push({
                    idAtributoValor: atributo.idAtributoValor,
                    valor: atributo.valor,
                    codigoHex: atributo.codigoHex,
                    conExistencia: variantes.some(
                        (v) => v.disponible > 0 && compatible(v, atributo.idAtributo, atributo.idAtributoValor, actual),
                    ),
                });
            }
        }
    }
    return [...grupos.values()]
        .sort((a, b) => a.orden - b.orden)
        .map(({ idAtributo, atributo, valores, ordenes }) => ({
            idAtributo,
            atributo,
            valores: [...valores].sort(
                (a, b) => (ordenes.get(a.idAtributoValor) ?? 0) - (ordenes.get(b.idAtributoValor) ?? 0),
            ),
        }));
}

/**
 * Variante al elegir un valor: la que conserva lo demás. Si esa combinación no existe, la primera
 * con ese valor y con existencia, para no dejar al cliente en una combinación imposible.
 */
export function varianteAlElegir(
    variantes: readonly VarianteDeProducto[],
    actual: VarianteDeProducto,
    idAtributo: number,
    idValor: number,
): VarianteDeProducto {
    const conValor = variantes.filter((v) => valorDe(v, idAtributo) === idValor);
    return (
        conValor.find((v) => compatible(v, idAtributo, idValor, actual)) ??
        conValor.find((v) => v.disponible > 0) ??
        conValor[0] ??
        actual
    );
}

/** Imágenes de la variante: las de sus valores (el color) y las generales. Sin coincidencias, todas. */
export function imagenesDeVariante(imagenes: DetalleDeProducto['imagenes'], variante: VarianteDeProducto | undefined) {
    const valores = new Set(variante?.atributos.map((a) => a.idAtributoValor));
    const propias = imagenes.filter((i) => i.idAtributoValor !== null && valores.has(i.idAtributoValor));
    const generales = imagenes.filter((i) => i.idAtributoValor === null);
    const elegidas = propias.length + generales.length > 0 ? [...propias, ...generales] : imagenes;
    return [...elegidas].sort((a, b) => Number(b.esPrincipal) - Number(a.esPrincipal) || a.orden - b.orden);
}
