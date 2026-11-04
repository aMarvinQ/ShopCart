import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    ADMIN,
    cerrarConexion,
    codigoError,
    crearAppPrueba,
    datos,
    iniciarSesion,
    type SesionPrueba,
} from '../apoyo/app.js';

/*
    Ordenamiento del lado del servidor en los listados del panel y de la cuenta, sobre los datos de
    la semilla: cada columna permitida en las dos direcciones, paginación estable (sin repetir
    registros aunque la columna tenga valores iguales), orden por defecto sin cambios y rechazo de
    lo que no esté en la lista.
*/
const app = crearAppPrueba();
let admin: SesionPrueba;
let cliente: SesionPrueba;

type Fila = Record<string, unknown>;
type Tipo = 'texto' | 'numero' | 'fecha';

interface Columna {
    orden: string;
    campo: string;
    tipo: Tipo;
}
interface Listado {
    nombre: string;
    ruta: string;
    consulta?: string;
    sesion: () => SesionPrueba;
    id: string;
    columnas: Columna[];
}

const ORDEN_ESTADOS = ['PAGADO', 'EN_PREPARACION', 'ENVIADO', 'ENTREGADO', 'CANCELADO', 'DEVUELTO_PARCIAL', 'DEVUELTO'];

const LISTADOS: Listado[] = [
    {
        nombre: 'pedidos del panel',
        ruta: '/api/v1/pedidos',
        sesion: () => admin,
        id: 'idPedido',
        columnas: [
            { orden: 'FECHA', campo: 'fechaPedido', tipo: 'fecha' },
            { orden: 'NUMERO', campo: 'numeroPedido', tipo: 'texto' },
            { orden: 'CLIENTE', campo: 'nombreContacto', tipo: 'texto' },
            { orden: 'TOTAL', campo: 'total', tipo: 'numero' },
        ],
    },
    {
        nombre: 'mis pedidos',
        ruta: '/api/v1/mis-pedidos',
        sesion: () => cliente,
        id: 'idPedido',
        columnas: [
            { orden: 'FECHA', campo: 'fechaPedido', tipo: 'fecha' },
            { orden: 'TOTAL', campo: 'total', tipo: 'numero' },
        ],
    },
    {
        nombre: 'productos',
        ruta: '/api/v1/productos',
        sesion: () => admin,
        id: 'idProducto',
        columnas: [
            { orden: 'NOMBRE', campo: 'nombre', tipo: 'texto' },
            { orden: 'CATEGORIA', campo: 'categoria', tipo: 'texto' },
            { orden: 'EXISTENCIA', campo: 'existenciaTotal', tipo: 'numero' },
        ],
    },
    {
        nombre: 'usuarios',
        ruta: '/api/v1/usuarios',
        sesion: () => admin,
        id: 'idUsuario',
        columnas: [
            { orden: 'CREACION', campo: 'fechaCreacion', tipo: 'fecha' },
            { orden: 'NOMBRE', campo: 'nombre', tipo: 'texto' },
            { orden: 'CORREO', campo: 'correo', tipo: 'texto' },
            { orden: 'ROL', campo: 'nombreRol', tipo: 'texto' },
        ],
    },
    {
        nombre: 'existencias',
        ruta: '/api/v1/inventario/existencias',
        sesion: () => admin,
        id: 'idVariante',
        columnas: [
            { orden: 'PRODUCTO', campo: 'producto', tipo: 'texto' },
            { orden: 'SKU', campo: 'sku', tipo: 'texto' },
            { orden: 'CATEGORIA', campo: 'categoria', tipo: 'texto' },
            { orden: 'FISICA', campo: 'existenciaFisica', tipo: 'numero' },
            { orden: 'RESERVADO', campo: 'reservado', tipo: 'numero' },
            { orden: 'DISPONIBLE', campo: 'disponible', tipo: 'numero' },
        ],
    },
    {
        nombre: 'kardex',
        ruta: '/api/v1/inventario/kardex',
        sesion: () => admin,
        id: 'idMovimientoInventario',
        columnas: [
            { orden: 'FECHA', campo: 'idMovimientoInventario', tipo: 'numero' },
            { orden: 'PRODUCTO', campo: 'producto', tipo: 'texto' },
            { orden: 'CANTIDAD', campo: 'cantidad', tipo: 'numero' },
        ],
    },
    {
        nombre: 'cupones',
        ruta: '/api/v1/cupones',
        sesion: () => admin,
        id: 'idCupon',
        columnas: [
            { orden: 'RECIENTES', campo: 'idCupon', tipo: 'numero' },
            { orden: 'CODIGO', campo: 'codigo', tipo: 'texto' },
            { orden: 'VIGENCIA', campo: 'fechaFin', tipo: 'fecha' },
            { orden: 'USOS', campo: 'usosActuales', tipo: 'numero' },
        ],
    },
    {
        nombre: 'devoluciones',
        ruta: '/api/v1/devoluciones',
        sesion: () => admin,
        id: 'idDevolucion',
        columnas: [
            { orden: 'FECHA', campo: 'fecha', tipo: 'fecha' },
            { orden: 'PEDIDO', campo: 'numeroPedido', tipo: 'texto' },
            { orden: 'MONTO', campo: 'montoReembolso', tipo: 'numero' },
        ],
    },
    {
        nombre: 'carritos abandonados',
        ruta: '/api/v1/reportes/carritos-abandonados',
        sesion: () => admin,
        id: 'idCarrito',
        columnas: [
            { orden: 'ACTIVIDAD', campo: 'fechaUltimaActividad', tipo: 'fecha' },
            { orden: 'VALOR', campo: 'valor', tipo: 'numero' },
            { orden: 'ARTICULOS', campo: 'articulos', tipo: 'numero' },
        ],
    },
    {
        nombre: 'bitácora',
        ruta: '/api/v1/bitacora',
        sesion: () => admin,
        id: 'idBitacora',
        columnas: [
            { orden: 'FECHA', campo: 'fecha', tipo: 'fecha' },
            { orden: 'MODULO', campo: 'modulo', tipo: 'texto' },
            { orden: 'ACCION', campo: 'accion', tipo: 'texto' },
        ],
    },
];

/* Los textos no se comparan aquí: su orden lo define la intercalación de SQL Server. */
function comparar(a: unknown, b: unknown, tipo: 'numero' | 'fecha'): number {
    if (tipo === 'numero') return Number(a) - Number(b);
    return new Date(String(a)).getTime() - new Date(String(b)).getTime();
}

const pedir = (listado: Listado, parametros: string) =>
    request(app).get(`${listado.ruta}?${parametros}`).set('Authorization', `Bearer ${listado.sesion().token}`);

const filasDe = async (listado: Listado, parametros: string) =>
    datos<Fila[]>(await pedir(listado, parametros).expect(200));

/** Todas las filas del listado, página por página (con tope, para que el ciclo siempre termine). */
async function todas(listado: Listado, parametros: string): Promise<Fila[]> {
    const filas: Fila[] = [];
    for (let pagina = 1; pagina <= 50; pagina += 1) {
        const lote = await filasDe(listado, `${parametros}&tamanoPagina=100&pagina=${String(pagina)}`);
        filas.push(...lote);
        if (lote.length < 100) break;
    }
    return filas;
}

beforeAll(async () => {
    admin = await iniciarSesion(app, ADMIN.correo, ADMIN.contrasena);
    cliente = await iniciarSesion(app, 'cliente@shopcart.test', 'Cliente#2026');
});
afterAll(cerrarConexion);

describe.each(LISTADOS)('ordenamiento: $nombre', (listado) => {
    it.each(listado.columnas)('$orden en las dos direcciones', async ({ orden, campo, tipo }) => {
        const asc = await todas(listado, `ordenarPor=${orden}&direccion=ASC`);
        const desc = await todas(listado, `ordenarPor=${orden}&direccion=DESC`);
        expect(asc.length).toBeGreaterThan(0);
        expect(desc).toHaveLength(asc.length);
        // En todas las columnas: el orden descendente es exactamente el inverso del ascendente.
        expect(desc.map((f) => f[campo])).toEqual(asc.map((f) => f[campo]).reverse());
        if (tipo === 'texto') return;
        for (let i = 1; i < asc.length; i += 1) {
            expect(comparar(asc[i - 1]?.[campo], asc[i]?.[campo], tipo)).toBeLessThanOrEqual(0);
        }
    });

    it('la paginación es estable: las páginas no repiten registros aunque haya valores iguales', async () => {
        const { orden } = listado.columnas.at(-1) as Columna;
        const base = `ordenarPor=${orden}&direccion=ASC&tamanoPagina=3`;
        const paginas = await Promise.all([1, 2, 3].map((p) => filasDe(listado, `${base}&pagina=${String(p)}`)));
        const ids = paginas.flat().map((fila) => fila[listado.id]);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('una columna fuera de la lista o una dirección inválida responden 400', async () => {
        await pedir(listado, 'ordenarPor=NO_EXISTE').expect(400);
        await pedir(listado, 'ordenarPor=1;DROP%20TABLE%20x').expect(400);
        expect(codigoError(await pedir(listado, 'direccion=ABAJO').expect(400))).toBe('SOLICITUD_INVALIDA');
    });
});

describe('orden por defecto y casos especiales', () => {
    it('sin parámetros se conserva el orden de siempre', async () => {
        const pedidos = LISTADOS[0] as Listado;
        const porDefecto = await filasDe(pedidos, 'tamanoPagina=20');
        const explicito = await filasDe(pedidos, 'ordenarPor=FECHA&direccion=DESC&tamanoPagina=20');
        expect(porDefecto).toEqual(explicito);
        const existencias = LISTADOS[4] as Listado;
        const nombres = (await filasDe(existencias, 'tamanoPagina=20')).map((f) => f.producto);
        expect(nombres).toEqual(
            (await filasDe(existencias, 'ordenarPor=PRODUCTO&direccion=ASC&tamanoPagina=20')).map((f) => f.producto),
        );
    });

    it('pedidos por estado: sigue el orden del ciclo de vida, no el alfabético', async () => {
        const pedidos = LISTADOS[0] as Listado;
        const filas = await filasDe(pedidos, 'ordenarPor=ESTADO&direccion=ASC&tamanoPagina=100');
        const posiciones = filas.map((f) => ORDEN_ESTADOS.indexOf(String(f.codigoEstado)));
        expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
        // Cada dirección empieza por un extremo distinto del ciclo (los datos acumulados pueden
        // llenar la página con un solo estado).
        const inverso = await filasDe(pedidos, 'ordenarPor=ESTADO&direccion=DESC&tamanoPagina=100');
        const posicionesInverso = inverso.map((f) => ORDEN_ESTADOS.indexOf(String(f.codigoEstado)));
        expect(posicionesInverso).toEqual([...posicionesInverso].sort((x, y) => y - x));
        expect(posicionesInverso[0]).toBeGreaterThan(posiciones[0] as number);
    });

    it('los valores nulos quedan al final en las dos direcciones', async () => {
        const usuarios = LISTADOS[3] as Listado;
        for (const direccion of ['ASC', 'DESC']) {
            const filas = await filasDe(usuarios, `ordenarPor=ACCESO&direccion=${direccion}&tamanoPagina=100`);
            const nulos = filas.map((f) => f.ultimoAcceso === null);
            const primerNulo = nulos.indexOf(true);
            if (primerNulo !== -1) expect(nulos.slice(primerNulo).every(Boolean)).toBe(true);
        }
        const productos = LISTADOS[2] as Listado;
        for (const direccion of ['ASC', 'DESC']) {
            const filas = await filasDe(productos, `ordenarPor=PRECIO&direccion=${direccion}&tamanoPagina=100`);
            const precios = filas.map((f) => f.precioMinimo).filter((p) => p !== null);
            expect(precios.length).toBeGreaterThan(0);
            const signo = direccion === 'ASC' ? 1 : -1;
            for (let i = 1; i < precios.length; i += 1) {
                expect(signo * (Number(precios[i]) - Number(precios[i - 1]))).toBeGreaterThanOrEqual(0);
            }
        }
    });

    it('la exportación de la bitácora respeta el orden de la tabla', async () => {
        const respuesta = await request(app)
            .get('/api/v1/bitacora/exportar?ordenarPor=FECHA&direccion=ASC')
            .set('Authorization', `Bearer ${admin.token}`)
            .buffer(true)
            .parse((res, listo) => {
                const partes: Buffer[] = [];
                res.on('data', (parte: Buffer) => partes.push(parte));
                res.on('end', () => {
                    listo(null, Buffer.concat(partes));
                });
            })
            .expect(200);
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(respuesta.body as ArrayBuffer);
        const hoja = libro.getWorksheet('Bitácora');
        const primera = hoja?.getCell('A2').value as Date;
        const segunda = hoja?.getCell('A3').value as Date;
        expect(primera.getTime()).toBeLessThanOrEqual(segunda.getTime());
    });
});
