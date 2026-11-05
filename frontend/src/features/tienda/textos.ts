/** Plazo de un método de envío, en palabras. */
export function textoPlazo(minimo: number, maximo: number): string {
    const dias = `${String(maximo)} ${maximo === 1 ? 'día' : 'días'}`;
    if (minimo === 0) return `Hasta ${dias}`;
    return minimo === maximo ? dias : `De ${String(minimo)} a ${dias}`;
}
