/** "Cocina & Baño" → "cocina-bano": lo que espera la API para las direcciones de la tienda. */
export function aSlug(texto: string, maximo = 120): string {
    return texto
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, maximo)
        .replace(/-+$/, '');
}
