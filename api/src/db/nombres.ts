/*
    Las columnas de los SPs están en PascalCase (IDUsuario, CodigoRol); la API responde en
    camelCase (idUsuario, codigoRol), la convención de JSON. Una sigla al inicio va completa en
    minúsculas: IDDepartamento → idDepartamento, SKU → sku.
*/
const SIGLA_INICIAL = /^([A-Z]+)(?=[A-Z][a-z]|\d|$)/;

export function aCamel(nombre: string): string {
    const sigla = SIGLA_INICIAL.exec(nombre)?.[1];
    if (sigla && sigla.length > 1) return sigla.toLowerCase() + nombre.slice(sigla.length);
    return nombre.charAt(0).toLowerCase() + nombre.slice(1);
}

/** Copia de la fila con las claves en camelCase (sin recorrer objetos anidados). */
export function filaACamel(fila: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [aCamel(clave), valor]));
}

/** JSON anidado de una columna (FOR JSON) con sus claves en camelCase, en todos los niveles. */
export function jsonACamel(texto: string | null): unknown {
    if (texto === null) return null;
    return JSON.parse(texto, function (this: unknown, _clave, valor: unknown) {
        if (valor && typeof valor === 'object' && !Array.isArray(valor))
            return filaACamel(valor as Record<string, unknown>);
        return valor;
    });
}
