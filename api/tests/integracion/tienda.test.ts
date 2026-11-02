import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { cerrarConexion, codigoError, crearAppPrueba, datos } from '../apoyo/app.js';

/* La tienda pública sobre el catálogo de la semilla de demostración (presente en la base de pruebas). */
const app = crearAppPrueba();
afterAll(cerrarConexion);

interface Tarjeta {
    nombre: string;
    precio: number;
    disponible: boolean;
    slugCategoria: string;
    imagenPrincipal: string | null;
}

describe('tienda pública (sin sesión)', () => {
    it('categorías con productos visibles', async () => {
        const categorias = datos<{ slug: string; productosVisibles: number }[]>(
            await request(app).get('/api/v1/tienda/categorias').expect(200),
        );
        expect(categorias.map((c) => c.slug)).toEqual(expect.arrayContaining(['ropa', 'calzado', 'bebidas']));
        expect(categorias.every((c) => c.productosVisibles > 0)).toBe(true);
    });

    it('búsqueda sin distinguir mayúsculas ni tildes, con tarjeta de precio e imagen', async () => {
        const respuesta = await request(app).get('/api/v1/tienda/productos?texto=CAFE').expect(200);
        const tarjetas = datos<Tarjeta[]>(respuesta);
        expect(tarjetas).toHaveLength(1);
        expect(tarjetas[0]).toMatchObject({ nombre: 'Café molido 454 g', slugCategoria: 'bebidas', disponible: true });
        expect(tarjetas[0]?.imagenPrincipal).toMatch(/^\/uploads\/productos\//);
        expect((respuesta.body as { meta: object }).meta).toEqual({ pagina: 1, tamanoPagina: 20, totalRegistros: 1 });
    });

    it('filtra por categoría y ordena por precio', async () => {
        const tarjetas = datos<Tarjeta[]>(
            await request(app)
                .get('/api/v1/tienda/productos?categoria=calzado&ordenarPor=PRECIO&direccion=ASC')
                .expect(200),
        );
        expect(tarjetas.map((t) => t.nombre)).toEqual(['Sandalias de playa', 'Tenis para correr']);
        expect(tarjetas[0]?.precio).toBeLessThan(tarjetas[1]?.precio ?? 0);
    });

    it('el producto descontinuado (inactivo) no aparece', async () => {
        expect(
            datos<Tarjeta[]>(await request(app).get('/api/v1/tienda/productos?texto=bocina%20retro').expect(200)),
        ).toEqual([]);
        expect(codigoError(await request(app).get('/api/v1/tienda/productos/bocina-retro').expect(404))).toBe(
            'PRODUCTO_NO_ENCONTRADO',
        );
    });

    it('detalle: la selección inicial salta la primera combinación agotada (Negro/S)', async () => {
        const producto = datos<{
            variantes: {
                sku: string;
                disponible: number;
                esSeleccionInicial: boolean;
                atributos: { atributo: string }[];
            }[];
            imagenes: { rutaImagen: string; idAtributoValor: number | null }[];
        }>(await request(app).get('/api/v1/tienda/productos/playera-basica').expect(200));
        const inicial = producto.variantes[0];
        expect(inicial?.esSeleccionInicial).toBe(true);
        expect(inicial?.sku).not.toBe('PLA-NEG-S');
        expect(inicial?.disponible).toBeGreaterThan(0);
        expect(producto.variantes.at(-1)).toMatchObject({ sku: 'PLA-NEG-S', disponible: 0 }); // agotada al final
        expect(inicial?.atributos.map((a) => a.atributo)).toEqual(['Color', 'Talla']);
        expect(producto.imagenes.some((i) => i.idAtributoValor === null)).toBe(true); // general
        expect(producto.imagenes.some((i) => i.idAtributoValor !== null)).toBe(true); // por color
    });

    it('validación de los filtros (400)', async () => {
        await request(app).get('/api/v1/tienda/productos?ordenarPor=STOCK').expect(400);
        await request(app).get('/api/v1/tienda/productos?precioMinimo=-5').expect(400);
        await request(app).get('/api/v1/tienda/productos/Slug%20Invalido').expect(400);
    });
});
