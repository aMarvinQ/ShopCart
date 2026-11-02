import type { z } from '../../config/zod.js';
import { ejecutarProcedimiento, tablaSql, TipoSql, type Parametro, type ValorCelda } from '../../db/index.js';
import type { esquemaDatosCategoria, esquemaListarProductos, ImagenNueva, VarianteNueva } from './catalogo.schemas.js';

/* Administración del catálogo (ADMIN). Cada SP valida permisos y reglas, y registra la bitácora. */

type Fila = Record<string, unknown>;
const JSON_CATEGORIA = { json: ['atributos'] };
const JSON_ATRIBUTO = { json: ['valores'] };
const JSON_PRODUCTO = { json: ['variantes', 'imagenes'] };

const actor = (idUsuario: number): Record<string, Parametro> => ({
    IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario },
});
const entero = (valor: number): Parametro => ({ tipo: TipoSql.Int, valor });
const bit = (valor: boolean): Parametro => ({ tipo: TipoSql.Bit, valor });
const version = (valor: Buffer): Parametro => ({ tipo: TipoSql.VarBinary(8), valor });

async function una(promesa: Promise<{ filas: Fila[] }>): Promise<Fila | undefined> {
    return (await promesa).filas[0];
}

/* --- Parámetros de tabla (TVP): un producto con todas sus variantes en una sola transacción --- */

function tablaVariantes(variantes: VarianteNueva[]) {
    return tablaSql(
        'dbo.TT_Catalogo_Variante',
        [
            { nombre: 'NumeroLinea', tipo: TipoSql.Int },
            { nombre: 'SKU', tipo: TipoSql.VarChar(50) },
            { nombre: 'Precio', tipo: TipoSql.Decimal(12, 2) },
            { nombre: 'ExistenciaInicial', tipo: TipoSql.Int },
        ],
        variantes.map((v, i) => [i + 1, v.sku, v.precio, v.existenciaInicial]),
    );
}

function tablaAtributosVariantes(variantes: VarianteNueva[]) {
    return tablaSql(
        'dbo.TT_Catalogo_VarianteAtributo',
        [
            { nombre: 'NumeroLinea', tipo: TipoSql.Int },
            { nombre: 'IDAtributo', tipo: TipoSql.Int },
            { nombre: 'IDAtributoValor', tipo: TipoSql.Int },
        ],
        variantes.flatMap((v, i) => v.atributos.map((a): ValorCelda[] => [i + 1, a.idAtributo, a.idAtributoValor])),
    );
}

function tablaImagenes(imagenes: ImagenNueva[]) {
    return tablaSql(
        'dbo.TT_Catalogo_ProductoImagen',
        [
            { nombre: 'NumeroLinea', tipo: TipoSql.Int },
            { nombre: 'RutaImagen', tipo: TipoSql.NVarChar(500) },
            { nombre: 'TextoAlternativo', tipo: TipoSql.NVarChar(200) },
            { nombre: 'IDAtributoValor', tipo: TipoSql.Int, nulo: true },
            { nombre: 'Orden', tipo: TipoSql.TinyInt },
            { nombre: 'EsPrincipal', tipo: TipoSql.Bit },
        ],
        imagenes.map((m, i) => [i + 1, m.ruta, m.textoAlternativo, m.idAtributoValor ?? null, m.orden, m.esPrincipal]),
    );
}

const tvp = (tabla: ReturnType<typeof tablaSql>): Parametro => ({ tipo: TipoSql.TVP, valor: tabla });

/* --- Categorías --------------------------------------------------------------------------- */

export const listarCategorias = async (admin: number) =>
    (
        await ejecutarProcedimiento('SP_Catalogo_ListarCategorias', actor(admin), {
            reintentable: true,
            ...JSON_CATEGORIA,
        })
    ).filas;

export const obtenerCategoria = (admin: number, idCategoria: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ObtenerCategoria',
            { ...actor(admin), IDCategoria: entero(idCategoria) },
            { reintentable: true, ...JSON_CATEGORIA },
        ),
    );

function datosCategoria(d: z.infer<typeof esquemaDatosCategoria>): Record<string, Parametro> {
    return {
        Nombre: { tipo: TipoSql.NVarChar(101), valor: d.nombre },
        Slug: { tipo: TipoSql.VarChar(121), valor: d.slug },
        Descripcion: { tipo: TipoSql.NVarChar(501), valor: d.descripcion ?? null },
    };
}

export const crearCategoria = (admin: number, d: z.infer<typeof esquemaDatosCategoria>) =>
    una(ejecutarProcedimiento('SP_Catalogo_CrearCategoria', { ...actor(admin), ...datosCategoria(d) }, JSON_CATEGORIA));

export const actualizarCategoria = (
    admin: number,
    idCategoria: number,
    d: z.infer<typeof esquemaDatosCategoria>,
    versionFila: Buffer,
) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ActualizarCategoria',
            {
                ...actor(admin),
                IDCategoria: entero(idCategoria),
                ...datosCategoria(d),
                VersionFila: version(versionFila),
            },
            JSON_CATEGORIA,
        ),
    );

export const cambiarEstadoCategoria = (admin: number, idCategoria: number, activo: boolean) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CambiarEstadoCategoria',
            { ...actor(admin), IDCategoria: entero(idCategoria), Activo: bit(activo) },
            JSON_CATEGORIA,
        ),
    );

export const asignarAtributosCategoria = (
    admin: number,
    idCategoria: number,
    atributos: { idAtributo: number; orden: number }[],
) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_AsignarAtributosCategoria',
            {
                ...actor(admin),
                IDCategoria: entero(idCategoria),
                Atributos: tvp(
                    tablaSql(
                        'dbo.TT_Catalogo_CategoriaAtributo',
                        [
                            { nombre: 'IDAtributo', tipo: TipoSql.Int },
                            { nombre: 'Orden', tipo: TipoSql.TinyInt },
                        ],
                        atributos.map((a) => [a.idAtributo, a.orden]),
                    ),
                ),
            },
            JSON_CATEGORIA,
        ),
    );

/* --- Atributos y valores ------------------------------------------------------------------ */

export const listarAtributos = async (admin: number) =>
    (await ejecutarProcedimiento('SP_Catalogo_ListarAtributos', actor(admin), { reintentable: true, ...JSON_ATRIBUTO }))
        .filas;

export const obtenerAtributo = (admin: number, idAtributo: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ObtenerAtributo',
            { ...actor(admin), IDAtributo: entero(idAtributo) },
            { reintentable: true, ...JSON_ATRIBUTO },
        ),
    );

export const crearAtributo = (admin: number, nombre: string) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CrearAtributo',
            { ...actor(admin), Nombre: { tipo: TipoSql.NVarChar(51), valor: nombre } },
            JSON_ATRIBUTO,
        ),
    );

export const actualizarAtributo = (admin: number, idAtributo: number, nombre: string) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ActualizarAtributo',
            { ...actor(admin), IDAtributo: entero(idAtributo), Nombre: { tipo: TipoSql.NVarChar(51), valor: nombre } },
            JSON_ATRIBUTO,
        ),
    );

export const cambiarEstadoAtributo = (admin: number, idAtributo: number, activo: boolean) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CambiarEstadoAtributo',
            { ...actor(admin), IDAtributo: entero(idAtributo), Activo: bit(activo) },
            JSON_ATRIBUTO,
        ),
    );

/* Los SPs de valores devuelven el valor creado o modificado (no el atributo completo). */
export interface DatosValor {
    valor: string;
    codigoHex?: string | null | undefined;
    orden?: number | undefined;
}

const datosValor = (d: DatosValor): Record<string, Parametro> => ({
    Valor: { tipo: TipoSql.NVarChar(51), valor: d.valor },
    CodigoHex: { tipo: TipoSql.VarChar(8), valor: d.codigoHex ?? null },
    Orden: { tipo: TipoSql.Int, valor: d.orden ?? null },
});

export const crearValor = (admin: number, idAtributo: number, d: DatosValor) =>
    una(
        ejecutarProcedimiento('SP_Catalogo_CrearAtributoValor', {
            ...actor(admin),
            IDAtributo: entero(idAtributo),
            ...datosValor(d),
        }),
    );

export const actualizarValor = (admin: number, idAtributoValor: number, d: DatosValor) =>
    una(
        ejecutarProcedimiento('SP_Catalogo_ActualizarAtributoValor', {
            ...actor(admin),
            IDAtributoValor: entero(idAtributoValor),
            ...datosValor(d),
        }),
    );

export const cambiarEstadoValor = (admin: number, idAtributoValor: number, activo: boolean) =>
    una(
        ejecutarProcedimiento('SP_Catalogo_CambiarEstadoAtributoValor', {
            ...actor(admin),
            IDAtributoValor: entero(idAtributoValor),
            Activo: bit(activo),
        }),
    );

/* --- Productos ---------------------------------------------------------------------------- */

export async function listarProductos(admin: number, f: z.infer<typeof esquemaListarProductos>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Catalogo_ListarProductos',
        {
            ...actor(admin),
            IDCategoria: { tipo: TipoSql.Int, valor: f.idCategoria ?? null },
            Activo: { tipo: TipoSql.Bit, valor: f.activo ?? null },
            Busqueda: { tipo: TipoSql.NVarChar(101), valor: f.busqueda || null },
            Pagina: entero(f.pagina),
            TamanoPagina: entero(f.tamanoPagina),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export const obtenerProducto = (admin: number, idProducto: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ObtenerProductoAdmin',
            { ...actor(admin), IDProducto: entero(idProducto) },
            { reintentable: true, ...JSON_PRODUCTO },
        ),
    );

export interface DatosProducto {
    idCategoria: number;
    nombre: string;
    slug: string;
    descripcion?: string | null | undefined;
}

const datosProducto = (d: DatosProducto): Record<string, Parametro> => ({
    IDCategoria: entero(d.idCategoria),
    Nombre: { tipo: TipoSql.NVarChar(201), valor: d.nombre },
    Slug: { tipo: TipoSql.VarChar(221), valor: d.slug },
    Descripcion: { tipo: TipoSql.NVarChar(TipoSql.MAX), valor: d.descripcion ?? null },
});

export const crearProducto = (admin: number, d: DatosProducto, variantes: VarianteNueva[], imagenes: ImagenNueva[]) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CrearProducto',
            {
                ...actor(admin),
                ...datosProducto(d),
                Variantes: tvp(tablaVariantes(variantes)),
                Atributos: tvp(tablaAtributosVariantes(variantes)),
                Imagenes: tvp(tablaImagenes(imagenes)),
            },
            JSON_PRODUCTO,
        ),
    );

export const actualizarProducto = (admin: number, idProducto: number, d: DatosProducto, versionFila: Buffer) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ActualizarProducto',
            { ...actor(admin), IDProducto: entero(idProducto), ...datosProducto(d), VersionFila: version(versionFila) },
            JSON_PRODUCTO,
        ),
    );

export const cambiarEstadoProducto = (admin: number, idProducto: number, activo: boolean) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CambiarEstadoProducto',
            { ...actor(admin), IDProducto: entero(idProducto), Activo: bit(activo) },
            JSON_PRODUCTO,
        ),
    );

export const agregarVariantes = (admin: number, idProducto: number, variantes: VarianteNueva[]) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_AgregarVariantes',
            {
                ...actor(admin),
                IDProducto: entero(idProducto),
                Variantes: tvp(tablaVariantes(variantes)),
                Atributos: tvp(tablaAtributosVariantes(variantes)),
            },
            JSON_PRODUCTO,
        ),
    );

export const actualizarVariante = (admin: number, idVariante: number, sku: string, versionFila: Buffer) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ActualizarVariante',
            {
                ...actor(admin),
                IDVariante: entero(idVariante),
                SKU: { tipo: TipoSql.VarChar(51), valor: sku },
                VersionFila: version(versionFila),
            },
            JSON_PRODUCTO,
        ),
    );

export const cambiarEstadoVariante = (admin: number, idVariante: number, activo: boolean) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CambiarEstadoVariante',
            { ...actor(admin), IDVariante: entero(idVariante), Activo: bit(activo) },
            JSON_PRODUCTO,
        ),
    );

export const cambiarPrecio = (admin: number, idVariante: number, precio: number, versionFila: Buffer) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_CambiarPrecio',
            {
                ...actor(admin),
                IDVariante: entero(idVariante),
                Precio: { tipo: TipoSql.Decimal(12, 2), valor: precio },
                VersionFila: version(versionFila),
            },
            JSON_PRODUCTO,
        ),
    );

export const listarHistorialPrecios = async (admin: number, idVariante: number) =>
    (
        await ejecutarProcedimiento(
            'SP_Catalogo_ListarHistorialPrecios',
            { ...actor(admin), IDVariante: entero(idVariante) },
            { reintentable: true },
        )
    ).filas;

/* --- Imágenes ----------------------------------------------------------------------------- */

export const agregarImagenes = (admin: number, idProducto: number, imagenes: ImagenNueva[]) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_AgregarImagenes',
            { ...actor(admin), IDProducto: entero(idProducto), Imagenes: tvp(tablaImagenes(imagenes)) },
            JSON_PRODUCTO,
        ),
    );

export const actualizarImagen = (admin: number, idImagen: number, textoAlternativo: string, orden: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_ActualizarImagen',
            {
                ...actor(admin),
                IDProductoImagen: entero(idImagen),
                TextoAlternativo: { tipo: TipoSql.NVarChar(201), valor: textoAlternativo },
                Orden: entero(orden),
            },
            JSON_PRODUCTO,
        ),
    );

export const establecerImagenPrincipal = (admin: number, idImagen: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Catalogo_EstablecerImagenPrincipal',
            { ...actor(admin), IDProductoImagen: entero(idImagen) },
            JSON_PRODUCTO,
        ),
    );

/** Elimina la fila; devuelve el producto y la ruta del archivo, que la API borra después. */
export async function eliminarImagen(
    admin: number,
    idImagen: number,
): Promise<{ idProducto: number; rutaImagen: string } | undefined> {
    const fila = await una(
        ejecutarProcedimiento('SP_Catalogo_EliminarImagen', { ...actor(admin), IDProductoImagen: entero(idImagen) }),
    );
    return fila as { idProducto: number; rutaImagen: string } | undefined;
}

/** De las rutas recibidas, las que alguna imagen de producto usa (limpieza de huérfanas). */
export async function filtrarImagenesEnUso(rutas: string[]): Promise<Set<string>> {
    const { filas } = await ejecutarProcedimiento<{ rutaImagen: string }>(
        'SP_Catalogo_FiltrarImagenesEnUso',
        { Rutas: { tipo: TipoSql.NVarChar(TipoSql.MAX), valor: JSON.stringify(rutas) } },
        { reintentable: true },
    );
    return new Set(filas.map((f) => f.rutaImagen));
}
