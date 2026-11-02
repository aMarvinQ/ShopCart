import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import sharp from 'sharp';
import request from 'supertest';
import { datos, sufijo, type SesionPrueba } from './app.js';

/*
    Ayudantes de las pruebas de compra: productos propios con una existencia exacta (para no
    depender de la semilla ni chocar con otras pruebas), carrito, checkout y pago.
*/

/** Tarjetas de prueba (D74). */
export const TARJETA = {
    visa: { numero: '4242 4242 4242 4242', titular: 'CLIENTE PRUEBA', vencimiento: '12/30', cvv: '123' },
    mastercard: { numero: '5555555555554444', titular: 'CLIENTE PRUEBA', vencimiento: '11/31', cvv: '456' },
    amex: { numero: '378282246310005', titular: 'CLIENTE PRUEBA', vencimiento: '10/32', cvv: '1234' },
    fondosInsuficientes: { numero: '4000000000009995', titular: 'CLIENTE PRUEBA', vencimiento: '12/30', cvv: '123' },
    reportada: { numero: '4000000000009979', titular: 'CLIENTE PRUEBA', vencimiento: '12/30', cvv: '123' },
};

export const DIRECCION_INVITADO = {
    correo: 'invitado.compra@prueba.test',
    nombreDestinatario: 'Invitado Prueba',
    telefono: '5555-1234',
    linea1: '4a calle 5-20 zona 1',
    idMunicipio: 101,
};

export interface ProductoPrueba {
    idProducto: number;
    idVariante: number;
    sku: string;
    slug: string;
}

let idCategoria: number | undefined;

/** Producto activo de una variante con `existencia` unidades a `precio`. */
export async function crearProducto(
    app: Express,
    admin: SesionPrueba,
    { existencia, precio = 100 }: { existencia: number; precio?: number },
): Promise<ProductoPrueba> {
    const comoAdmin = (prueba: request.Test) => prueba.set('Authorization', `Bearer ${admin.token}`);
    const marca = sufijo();
    if (idCategoria === undefined) {
        idCategoria = datos<{ idCategoria: number }>(
            await comoAdmin(request(app).post('/api/v1/categorias'))
                .send({ nombre: `Compras ${marca}`, slug: `compras-${marca}` })
                .expect(201),
        ).idCategoria;
        await comoAdmin(request(app).patch(`/api/v1/categorias/${String(idCategoria)}/estado`)).send({ activo: true });
    }
    const imagen = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#2266aa' } })
        .png()
        .toBuffer();
    const [ruta] = datos<{ rutas: string[] }>(
        await comoAdmin(request(app).post('/api/v1/imagenes')).attach('archivos', imagen, 'p.png').expect(201),
    ).rutas;
    const sku = `CMP-${marca}`.toUpperCase();
    const slug = `compra-${marca}`;
    const producto = datos<{ idProducto: number; variantes: { idVariante: number }[] }>(
        await comoAdmin(request(app).post('/api/v1/productos'))
            .send({
                idCategoria,
                nombre: `Producto de compra ${marca}`,
                slug,
                descripcion: 'Producto de las pruebas de compra',
                variantes: [{ sku, precio, existenciaInicial: existencia, atributos: [] }],
                imagenes: [{ ruta, textoAlternativo: 'Producto de prueba', esPrincipal: true }],
            })
            .expect(201),
    );
    await comoAdmin(request(app).patch(`/api/v1/productos/${String(producto.idProducto)}/estado`))
        .send({ activo: true })
        .expect(200);
    return { idProducto: producto.idProducto, idVariante: producto.variantes[0]?.idVariante ?? 0, sku, slug };
}

/** Existencia física actual de la variante (vista del administrador). */
export async function existenciaDe(app: Express, admin: SesionPrueba, producto: ProductoPrueba): Promise<number> {
    const detalle = datos<{ variantes: { idVariante: number; existenciaFisica: number }[] }>(
        await request(app)
            .get(`/api/v1/productos/${String(producto.idProducto)}`)
            .set('Authorization', `Bearer ${admin.token}`)
            .expect(200),
    );
    return detalle.variantes.find((v) => v.idVariante === producto.idVariante)?.existenciaFisica ?? -1;
}

/** Credencial del comprador: el token del cliente o la cookie del invitado. */
export type Credencial = { token: string } | { cookie: string };

export const comoComprador = (prueba: request.Test, credencial: Credencial): request.Test =>
    'token' in credencial
        ? prueba.set('Authorization', `Bearer ${credencial.token}`)
        : credencial.cookie
          ? prueba.set('Cookie', credencial.cookie)
          : prueba;

/** Agrega al carrito; para un invitado sin cookie devuelve la cookie que se le creó. */
export async function agregar(
    app: Express,
    credencial: Credencial,
    idVariante: number,
    cantidad = 1,
): Promise<Credencial> {
    const respuesta = await comoComprador(request(app).post('/api/v1/carrito/items'), credencial)
        .send({ idVariante, cantidad })
        .expect(200);
    if ('token' in credencial) return credencial;
    const cookie = (respuesta.headers['set-cookie'] as unknown as string[] | undefined)
        ?.find((c) => c.startsWith('shopcart_invitado='))
        ?.split(';')[0];
    return { cookie: cookie ?? credencial.cookie };
}

export const nuevaClave = (): string => randomUUID();

export const iniciarCheckout = (app: Express, credencial: Credencial, cuerpo: object, clave = nuevaClave()) =>
    comoComprador(request(app).post('/api/v1/checkout'), credencial).set('Idempotency-Key', clave).send(cuerpo);

export const pagar = (app: Express, credencial: Credencial, idCheckout: number, tarjeta = TARJETA.visa) =>
    comoComprador(request(app).post(`/api/v1/checkout/${String(idCheckout)}/pago`), credencial).send({ tarjeta });
