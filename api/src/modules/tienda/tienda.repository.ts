import type { z } from '../../config/zod.js';
import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';
import type { esquemaBuscar } from './tienda.schemas.js';

/* Lecturas públicas de la tienda: reintentables ante un deadlock (no modifican nada). */

export async function listarCategorias(): Promise<Record<string, unknown>[]> {
    return (await ejecutarProcedimiento('SP_Catalogo_ListarCategoriasTienda', {}, { reintentable: true })).filas;
}

export async function buscar(
    filtros: z.infer<typeof esquemaBuscar>,
): Promise<{ filas: Record<string, unknown>[]; total: number }> {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Catalogo_BuscarProductos',
        {
            Texto: { tipo: TipoSql.NVarChar(101), valor: filtros.texto || null },
            SlugCategoria: { tipo: TipoSql.VarChar(121), valor: filtros.categoria ?? null },
            PrecioMinimo: { tipo: TipoSql.Decimal(12, 2), valor: filtros.precioMinimo ?? null },
            PrecioMaximo: { tipo: TipoSql.Decimal(12, 2), valor: filtros.precioMaximo ?? null },
            SoloDisponibles: { tipo: TipoSql.Bit, valor: filtros.soloDisponibles ?? false },
            OrdenarPor: { tipo: TipoSql.VarChar(20), valor: filtros.ordenarPor },
            Direccion: { tipo: TipoSql.VarChar(4), valor: filtros.direccion },
            Pagina: { tipo: TipoSql.Int, valor: filtros.pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: filtros.tamanoPagina },
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export async function obtenerProducto(slug: string): Promise<Record<string, unknown> | undefined> {
    const { filas } = await ejecutarProcedimiento(
        'SP_Catalogo_ObtenerProducto',
        { Slug: { tipo: TipoSql.VarChar(221), valor: slug } },
        { reintentable: true, json: ['variantes', 'imagenes'] },
    );
    return filas[0];
}
