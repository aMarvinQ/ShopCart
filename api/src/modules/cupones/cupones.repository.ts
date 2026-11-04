import type { z } from '../../config/zod.js';
import { ejecutarProcedimiento, parametrosOrden, TipoSql, type Parametro } from '../../db/index.js';
import type { DatosCupon, esquemaListarCupones } from './cupones.schemas.js';

/* Cupones (ADMIN). Las reglas (situación, términos bloqueados tras el primer uso, límites) las aplica el SP. */

type Fila = Record<string, unknown>;
const actor = (idUsuario: number): Record<string, Parametro> => ({
    IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario },
});
const cupon = (idCupon: number): Parametro => ({ tipo: TipoSql.Int, valor: idCupon });

function datos(d: DatosCupon): Record<string, Parametro> {
    return {
        Codigo: { tipo: TipoSql.VarChar(31), valor: d.codigo },
        Descripcion: { tipo: TipoSql.NVarChar(301), valor: d.descripcion },
        TipoDescuento: { tipo: TipoSql.VarChar(13), valor: d.tipoDescuento },
        Valor: { tipo: TipoSql.Decimal(12, 2), valor: d.valor },
        MontoMinimo: { tipo: TipoSql.Decimal(12, 2), valor: d.montoMinimo },
        FechaInicio: { tipo: TipoSql.DateTime2(3), valor: d.fechaInicio },
        FechaFin: { tipo: TipoSql.DateTime2(3), valor: d.fechaFin },
        LimiteUsosTotal: { tipo: TipoSql.Int, valor: d.limiteUsosTotal ?? null },
        LimiteUsosPorCliente: { tipo: TipoSql.Int, valor: d.limiteUsosPorCliente ?? null },
        IDCategoria: { tipo: TipoSql.Int, valor: d.idCategoria ?? null },
        SoloRegistrados: { tipo: TipoSql.Bit, valor: d.soloRegistrados },
    };
}

const una = async (promesa: Promise<{ filas: Fila[] }>): Promise<Fila | undefined> => (await promesa).filas[0];

export async function listar(admin: number, f: z.infer<typeof esquemaListarCupones>) {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Cupones_Listar',
        {
            ...actor(admin),
            Busqueda: { tipo: TipoSql.NVarChar(101), valor: f.busqueda || null },
            Situacion: { tipo: TipoSql.VarChar(11), valor: f.situacion ?? null },
            Pagina: { tipo: TipoSql.Int, valor: f.pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: f.tamanoPagina },
            ...parametrosOrden(f),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}

export const obtener = (admin: number, idCupon: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Cupones_Obtener',
            { ...actor(admin), IDCupon: cupon(idCupon) },
            { reintentable: true },
        ),
    );

export const crear = (admin: number, d: DatosCupon) =>
    una(ejecutarProcedimiento('SP_Cupones_Crear', { ...actor(admin), ...datos(d) }));

export const actualizar = (admin: number, idCupon: number, d: DatosCupon, versionFila: Buffer) =>
    una(
        ejecutarProcedimiento('SP_Cupones_Actualizar', {
            ...actor(admin),
            IDCupon: cupon(idCupon),
            ...datos(d),
            VersionFila: { tipo: TipoSql.VarBinary(8), valor: versionFila },
        }),
    );

export const cambiarEstado = (admin: number, idCupon: number, activo: boolean) =>
    una(
        ejecutarProcedimiento('SP_Cupones_CambiarEstado', {
            ...actor(admin),
            IDCupon: cupon(idCupon),
            Activo: { tipo: TipoSql.Bit, valor: activo },
        }),
    );
