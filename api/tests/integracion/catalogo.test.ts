import { existsSync } from 'node:fs';
import { utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { limpiarImagenesHuerfanas } from '../../src/jobs/limpiarImagenes.js';
import { AlmacenImagenes } from '../../src/storage/almacenImagenes.js';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    OPERADOR,
    registrarCliente,
    sufijo,
    type SesionPrueba,
} from '../apoyo/app.js';

const app = crearAppPrueba();
const carpetaUploads = process.env.CARPETA_UPLOADS ?? '';
const archivoDe = (ruta: string) => path.join(carpetaUploads, ruta.replace('/uploads/', ''));
let admin: SesionPrueba;

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
});
afterAll(cerrarConexion);

const comoAdmin = (prueba: request.Test) => prueba.set('Authorization', `Bearer ${admin.token}`);

/** Imagen PNG real de 40×40 de un color. */
const png = (color: string) =>
    sharp({ create: { width: 40, height: 40, channels: 3, background: color } })
        .png()
        .toBuffer();

async function subir(...contenidos: Buffer[]): Promise<string[]> {
    let prueba = comoAdmin(request(app).post('/api/v1/imagenes'));
    contenidos.forEach((contenido, i) => {
        prueba = prueba.attach('archivos', contenido, `imagen-${i}.png`);
    });
    return datos<{ rutas: string[] }>(await prueba.expect(201)).rutas;
}

interface ProductoAdmin {
    idProducto: number;
    activo: boolean;
    versionFila: string;
    variantes: { idVariante: number; sku: string; precio: number; versionFila: string; existenciaFisica: number }[];
    imagenes: { idProductoImagen: number; rutaImagen: string; esPrincipal: boolean }[];
}

describe('subida de imágenes', () => {
    it('acepta imágenes reales y las guarda recodificadas como WebP con nombre aleatorio', async () => {
        const [ruta] = await subir(await png('#336699'));
        expect(ruta).toMatch(/^\/uploads\/productos\/[0-9a-f-]{36}\.webp$/);
        const metadatos = await sharp(archivoDe(ruta ?? '')).metadata();
        expect(metadatos.format).toBe('webp');
    });

    it('rechaza un archivo que no es imagen aunque se llame .jpg (se revisa el contenido)', async () => {
        const respuesta = await comoAdmin(request(app).post('/api/v1/imagenes'))
            .attach('archivos', Buffer.from('esto no es una imagen'), 'foto.jpg')
            .expect(400);
        expect(codigoError(respuesta)).toBe('ARCHIVO_INVALIDO');
    });

    it('rechaza archivos de más de 5 MB (413) y la subida sin archivos (400)', async () => {
        const grande = await comoAdmin(request(app).post('/api/v1/imagenes'))
            .attach('archivos', Buffer.alloc(5 * 1024 * 1024 + 1), 'grande.png')
            .expect(413);
        expect(codigoError(grande)).toBe('ARCHIVO_DEMASIADO_GRANDE');
        await comoAdmin(request(app).post('/api/v1/imagenes')).field('x', '1').expect(400);
    });

    it('solo el administrador sube imágenes', async () => {
        const operador = await iniciarSesion(app, OPERADOR.correo, OPERADOR.contrasena);
        await request(app)
            .post('/api/v1/imagenes')
            .set('Authorization', `Bearer ${operador.token}`)
            .attach('archivos', await png('#000000'), 'a.png')
            .expect(403);
        await request(app)
            .post('/api/v1/imagenes')
            .attach('archivos', await png('#000000'), 'a.png')
            .expect(401);
    });
});

describe('flujo del administrador: categoría → atributo → producto → tienda', () => {
    const marca = sufijo();
    let idCategoria: number;
    let valores: { idAtributo: number; idAtributoValor: number }[];
    let producto: ProductoAdmin;

    it('crea una categoría con un atributo y sus valores', async () => {
        const categoria = datos<{ idCategoria: number; versionFila: string }>(
            await comoAdmin(request(app).post('/api/v1/categorias'))
                .send({ nombre: `Prueba ${marca}`, slug: `prueba-${marca}` })
                .expect(201),
        );
        idCategoria = categoria.idCategoria;

        const atributo = datos<{ idAtributo: number }>(
            await comoAdmin(request(app).post('/api/v1/atributos'))
                .send({ nombre: `Material ${marca}` })
                .expect(201),
        );
        const lona = datos<{ idAtributoValor: number; orden: number }>(
            await comoAdmin(request(app).post(`/api/v1/atributos/${atributo.idAtributo}/valores`))
                .send({ valor: 'Lona' })
                .expect(201),
        );
        expect(lona.orden).toBe(1);
        await comoAdmin(request(app).post(`/api/v1/atributos/${atributo.idAtributo}/valores`))
            .send({ valor: 'Cuero' })
            .expect(201);
        const conValores = datos<{ valores: { idAtributoValor: number; valor: string; orden: number }[] }>(
            await comoAdmin(request(app).get(`/api/v1/atributos/${atributo.idAtributo}`)).expect(200),
        );
        expect(conValores.valores.map((v) => `${v.valor}:${v.orden}`)).toEqual(['Lona:1', 'Cuero:2']);
        valores = conValores.valores.map((v) => ({
            idAtributo: atributo.idAtributo,
            idAtributoValor: v.idAtributoValor,
        }));

        const asignada = datos<{ atributos: { idAtributo: number }[] }>(
            await comoAdmin(request(app).put(`/api/v1/categorias/${idCategoria}/atributos`))
                .send({ atributos: [{ idAtributo: atributo.idAtributo, orden: 1 }] })
                .expect(200),
        );
        expect(asignada.atributos).toHaveLength(1);
    });

    it('crea el producto con variantes e imagen en una operación; nace inactivo y no se ve en la tienda', async () => {
        const [ruta] = await subir(await png('#884422'));
        producto = datos<ProductoAdmin>(
            await comoAdmin(request(app).post('/api/v1/productos'))
                .send({
                    idCategoria,
                    nombre: `Mochila ${marca}`,
                    slug: `mochila-${marca}`,
                    descripcion: 'Mochila de prueba',
                    variantes: [
                        {
                            sku: `MOC-${marca}-L`.toUpperCase(),
                            precio: '199.90',
                            existenciaInicial: 7,
                            atributos: [valores[0]],
                        },
                        {
                            sku: `MOC-${marca}-C`.toUpperCase(),
                            precio: 249,
                            existenciaInicial: 3,
                            atributos: [valores[1]],
                        },
                    ],
                    imagenes: [{ ruta, textoAlternativo: 'Mochila de prueba', esPrincipal: true }],
                })
                .expect(201),
        );
        expect(producto.activo).toBe(false);
        expect(producto.variantes.map((v) => `${v.precio}:${v.existenciaFisica}`).sort()).toEqual(['199.9:7', '249:3']);
        expect(producto.versionFila).toMatch(/^[A-Za-z0-9+/]{11}=$/);
        await request(app).get(`/api/v1/tienda/productos/mochila-${marca}`).expect(404);
    });

    it('al activarlo aparece en la tienda', async () => {
        await comoAdmin(request(app).patch(`/api/v1/productos/${producto.idProducto}/estado`))
            .send({ activo: true })
            .expect(200);
        const tienda = datos<{ variantes: unknown[] }>(
            await request(app).get(`/api/v1/tienda/productos/mochila-${marca}`).expect(200),
        );
        expect(tienda.variantes).toHaveLength(2);
    });

    it('cambia el precio con historial; una versión vieja da 409 EDICION_CONCURRENTE', async () => {
        const variante = producto.variantes.find((v) => v.precio === 249);
        if (!variante) throw new Error('falta la variante');
        const cambiado = datos<ProductoAdmin>(
            await comoAdmin(request(app).put(`/api/v1/variantes/${variante.idVariante}/precio`))
                .send({ precio: 229.5, versionFila: variante.versionFila })
                .expect(200),
        );
        expect(cambiado.variantes.find((v) => v.idVariante === variante.idVariante)?.precio).toBe(229.5);

        const conflicto = await comoAdmin(request(app).put(`/api/v1/variantes/${variante.idVariante}/precio`))
            .send({ precio: 1, versionFila: variante.versionFila })
            .expect(409);
        expect(codigoError(conflicto)).toBe('EDICION_CONCURRENTE');

        const historial = datos<{ precioAnterior: number | null; precioNuevo: number }[]>(
            await comoAdmin(request(app).get(`/api/v1/variantes/${variante.idVariante}/precios`)).expect(200),
        );
        expect(historial[0]).toMatchObject({ precioAnterior: 249, precioNuevo: 229.5 });
    });

    it('editar el producto: con la versión vigente → 200; repetir con la anterior → 409', async () => {
        // La activación y el cambio de precio ya cambiaron la versión: se lee la vigente, como haría el formulario.
        const vigente = datos<ProductoAdmin>(
            await comoAdmin(request(app).get(`/api/v1/productos/${producto.idProducto}`)).expect(200),
        );
        const datosProducto = { idCategoria, nombre: `Mochila ${marca} v2`, slug: `mochila-${marca}` };
        await comoAdmin(request(app).put(`/api/v1/productos/${producto.idProducto}`))
            .send({ ...datosProducto, versionFila: vigente.versionFila })
            .expect(200);
        const conflicto = await comoAdmin(request(app).put(`/api/v1/productos/${producto.idProducto}`))
            .send({ ...datosProducto, nombre: 'Otro nombre', versionFila: vigente.versionFila })
            .expect(409);
        expect(codigoError(conflicto)).toBe('EDICION_CONCURRENTE');
    });

    it('no se puede quitar la última imagen de un producto activo; al eliminar una se borra su archivo', async () => {
        const unica = producto.imagenes[0];
        if (!unica) throw new Error('falta la imagen');
        expect(
            codigoError(await comoAdmin(request(app).delete(`/api/v1/imagenes/${unica.idProductoImagen}`)).expect(409)),
        ).toBe('PRODUCTO_SIN_IMAGEN');

        const [segunda] = await subir(await png('#228844'));
        await comoAdmin(request(app).post(`/api/v1/productos/${producto.idProducto}/imagenes`))
            .send({ imagenes: [{ ruta: segunda, textoAlternativo: 'Otra vista' }] })
            .expect(201);
        const despues = datos<ProductoAdmin>(
            await comoAdmin(request(app).delete(`/api/v1/imagenes/${unica.idProductoImagen}`)).expect(200),
        );
        expect(despues.imagenes.map((i) => i.rutaImagen)).toEqual([segunda]);
        expect(despues.imagenes[0]?.esPrincipal).toBe(true); // la que queda pasa a ser la principal
        expect(existsSync(archivoDe(unica.rutaImagen))).toBe(false);
    });

    it('datos inválidos (400) y slug repetido (409)', async () => {
        await comoAdmin(request(app).post('/api/v1/productos'))
            .send({ idCategoria, nombre: 'X', slug: 'Con Espacios', variantes: [] })
            .expect(400);
        const repetido = await comoAdmin(request(app).post('/api/v1/categorias'))
            .send({ nombre: `Otra ${marca}`, slug: `prueba-${marca}` })
            .expect(409);
        expect(codigoError(repetido)).toBe('SLUG_REGISTRADO');
    });
});

describe('permisos del catálogo', () => {
    it('el operador y el cliente no administran el catálogo', async () => {
        const operador = await iniciarSesion(app, OPERADOR.correo, OPERADOR.contrasena);
        const cliente = await registrarCliente(app);
        await request(app).get('/api/v1/productos').set('Authorization', `Bearer ${operador.token}`).expect(403);
        await request(app)
            .post('/api/v1/categorias')
            .set('Authorization', `Bearer ${cliente.token}`)
            .send({ nombre: 'X', slug: 'x' })
            .expect(403);
    });
});

describe('limpieza de imágenes huérfanas', () => {
    it('borra los archivos sin uso de más de 24 h y conserva los usados y los recientes', async () => {
        const almacen = new AlmacenImagenes(carpetaUploads);
        const [huerfana, reciente] = await subir(await png('#101010'), await png('#202020'));
        // Una imagen en uso con fecha antigua: se copia el archivo de una ruta que sí está en la base.
        const productoSemilla = datos<{ imagenes: { rutaImagen: string }[] }>(
            await request(app).get('/api/v1/tienda/productos/cafe-molido-454-g').expect(200),
        );
        const rutaEnUso = productoSemilla.imagenes[0]?.rutaImagen ?? '';
        await writeFile(archivoDe(rutaEnUso), await png('#303030'));

        const hace2Dias = new Date(Date.now() - 48 * 60 * 60 * 1000);
        await utimes(archivoDe(huerfana ?? ''), hace2Dias, hace2Dias);
        await utimes(archivoDe(rutaEnUso), hace2Dias, hace2Dias);

        const eliminadas = await limpiarImagenesHuerfanas(almacen);
        expect(eliminadas).toContain(huerfana);
        expect(eliminadas).not.toContain(rutaEnUso);
        expect(eliminadas).not.toContain(reciente);
        expect(existsSync(archivoDe(huerfana ?? ''))).toBe(false);
        expect(existsSync(archivoDe(rutaEnUso))).toBe(true);
        expect(existsSync(archivoDe(reciente ?? ''))).toBe(true);
    });
});
