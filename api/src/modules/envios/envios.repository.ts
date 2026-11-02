import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';

export async function listarDepartamentos(): Promise<Record<string, unknown>[]> {
    return (await ejecutarProcedimiento('SP_Envios_ListarDepartamentos', {}, { reintentable: true })).filas;
}

export async function listarMunicipios(idDepartamento: number): Promise<Record<string, unknown>[]> {
    const { filas } = await ejecutarProcedimiento(
        'SP_Envios_ListarMunicipios',
        { IDDepartamento: { tipo: TipoSql.TinyInt, valor: idDepartamento } },
        { reintentable: true },
    );
    return filas;
}

/* --- Métodos de envío ---------------------------------------------------------------------- */

type Fila = Record<string, unknown>;
const actor = (idUsuario: number) => ({ IDUsuarioAccion: { tipo: TipoSql.Int, valor: idUsuario } });
const metodo = (idMetodo: number) => ({ IDMetodoEnvio: { tipo: TipoSql.Int, valor: idMetodo } });
const una = async (promesa: Promise<{ filas: Fila[] }>): Promise<Fila | undefined> => (await promesa).filas[0];

export interface DatosMetodo {
    nombre: string;
    descripcion?: string | null | undefined;
    costo: number;
    diasEstimadosMin: number;
    diasEstimadosMax: number;
}

const datosMetodo = (d: DatosMetodo) => ({
    Nombre: { tipo: TipoSql.NVarChar(101), valor: d.nombre },
    Descripcion: { tipo: TipoSql.NVarChar(301), valor: d.descripcion ?? null },
    Costo: { tipo: TipoSql.Decimal(12, 2), valor: d.costo },
    DiasEstimadosMin: { tipo: TipoSql.Int, valor: d.diasEstimadosMin },
    DiasEstimadosMax: { tipo: TipoSql.Int, valor: d.diasEstimadosMax },
});

/** Los que el cliente puede elegir (activos), del más barato al más caro. */
export async function listarMetodosTienda(): Promise<Fila[]> {
    return (await ejecutarProcedimiento('SP_Envios_ListarMetodosTienda', {}, { reintentable: true })).filas;
}

export async function listarMetodos(admin: number): Promise<Fila[]> {
    return (await ejecutarProcedimiento('SP_Envios_ListarMetodos', actor(admin), { reintentable: true })).filas;
}

export const obtenerMetodo = (admin: number, idMetodo: number) =>
    una(
        ejecutarProcedimiento(
            'SP_Envios_ObtenerMetodo',
            { ...actor(admin), ...metodo(idMetodo) },
            { reintentable: true },
        ),
    );

export const crearMetodo = (admin: number, d: DatosMetodo) =>
    una(ejecutarProcedimiento('SP_Envios_CrearMetodo', { ...actor(admin), ...datosMetodo(d) }));

export const actualizarMetodo = (admin: number, idMetodo: number, d: DatosMetodo, versionFila: Buffer) =>
    una(
        ejecutarProcedimiento('SP_Envios_ActualizarMetodo', {
            ...actor(admin),
            ...metodo(idMetodo),
            ...datosMetodo(d),
            VersionFila: { tipo: TipoSql.VarBinary(8), valor: versionFila },
        }),
    );

export const cambiarEstadoMetodo = (admin: number, idMetodo: number, activo: boolean) =>
    una(
        ejecutarProcedimiento('SP_Envios_CambiarEstadoMetodo', {
            ...actor(admin),
            ...metodo(idMetodo),
            Activo: { tipo: TipoSql.Bit, valor: activo },
        }),
    );
