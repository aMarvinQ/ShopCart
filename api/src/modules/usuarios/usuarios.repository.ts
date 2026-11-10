import { ejecutarProcedimiento, parametrosOrden, TipoSql } from '../../db/index.js';
import type { z } from '../../config/zod.js';
import type {
    esquemaActualizarInterno,
    esquemaActualizarPerfil,
    esquemaCrearInterno,
    esquemaListarUsuarios,
} from './usuarios.schemas.js';

export type FilaUsuario = Record<string, unknown>;

export async function obtenerPerfil(idUsuario: number): Promise<FilaUsuario | undefined> {
    const { filas } = await ejecutarProcedimiento('SP_Usuarios_ObtenerPerfil', {
        IDUsuarioSolicitante: { tipo: TipoSql.Int, valor: idUsuario },
    });
    return filas[0];
}

export async function actualizarPerfil(
    idUsuario: number,
    datos: z.infer<typeof esquemaActualizarPerfil>,
): Promise<FilaUsuario | undefined> {
    const { filas } = await ejecutarProcedimiento('SP_Usuarios_ActualizarPerfil', {
        IDUsuarioSolicitante: { tipo: TipoSql.Int, valor: idUsuario },
        Nombre: { tipo: TipoSql.NVarChar(101), valor: datos.nombre },
        Apellido: { tipo: TipoSql.NVarChar(101), valor: datos.apellido },
        Telefono: { tipo: TipoSql.NVarChar(21), valor: datos.telefono ?? null },
    });
    return filas[0];
}

export async function crearInterno(
    idAdmin: number,
    datos: z.infer<typeof esquemaCrearInterno>,
    hash: string,
): Promise<FilaUsuario | undefined> {
    const { filas } = await ejecutarProcedimiento('SP_Usuarios_CrearInterno', {
        IDUsuarioAccion: { tipo: TipoSql.Int, valor: idAdmin },
        Correo: { tipo: TipoSql.NVarChar(255), valor: datos.correo },
        HashContrasena: { tipo: TipoSql.VarChar(256), valor: hash },
        Nombre: { tipo: TipoSql.NVarChar(101), valor: datos.nombre },
        Apellido: { tipo: TipoSql.NVarChar(101), valor: datos.apellido },
        Telefono: { tipo: TipoSql.NVarChar(21), valor: datos.telefono ?? null },
        CodigoRol: { tipo: TipoSql.VarChar(20), valor: datos.rol },
    });
    return filas[0];
}

export async function actualizarInterno(
    idAdmin: number,
    idUsuario: number,
    datos: z.infer<typeof esquemaActualizarInterno>,
): Promise<FilaUsuario | undefined> {
    const { filas } = await ejecutarProcedimiento('SP_Usuarios_ActualizarInterno', {
        IDUsuarioAccion: { tipo: TipoSql.Int, valor: idAdmin },
        IDUsuario: { tipo: TipoSql.Int, valor: idUsuario },
        Nombre: { tipo: TipoSql.NVarChar(101), valor: datos.nombre },
        Apellido: { tipo: TipoSql.NVarChar(101), valor: datos.apellido },
        Telefono: { tipo: TipoSql.NVarChar(21), valor: datos.telefono ?? null },
        CodigoRol: { tipo: TipoSql.VarChar(20), valor: datos.rol },
        FechaModificacion: { tipo: TipoSql.DateTime2(3), valor: datos.fechaModificacion },
    });
    return filas[0];
}

export async function cambiarEstado(
    idAdmin: number,
    idUsuario: number,
    activo: boolean,
): Promise<FilaUsuario | undefined> {
    const { filas } = await ejecutarProcedimiento('SP_Usuarios_CambiarEstado', {
        IDUsuarioAccion: { tipo: TipoSql.Int, valor: idAdmin },
        IDUsuario: { tipo: TipoSql.Int, valor: idUsuario },
        Activo: { tipo: TipoSql.Bit, valor: activo },
    });
    return filas[0];
}

export async function listar(
    idAdmin: number,
    filtros: z.infer<typeof esquemaListarUsuarios>,
): Promise<{ filas: FilaUsuario[]; total: number }> {
    const { filas, salidas } = await ejecutarProcedimiento(
        'SP_Usuarios_Listar',
        {
            IDUsuarioAccion: { tipo: TipoSql.Int, valor: idAdmin },
            CodigoRol: { tipo: TipoSql.VarChar(20), valor: filtros.rol ?? null },
            Activo: { tipo: TipoSql.Bit, valor: filtros.activo ?? null },
            Busqueda: { tipo: TipoSql.NVarChar(101), valor: filtros.busqueda || null },
            Pagina: { tipo: TipoSql.Int, valor: filtros.pagina },
            TamanoPagina: { tipo: TipoSql.Int, valor: filtros.tamanoPagina },
            ...parametrosOrden(filtros),
        },
        { salidas: { TotalRegistros: TipoSql.Int }, reintentable: true },
    );
    return { filas, total: Number(salidas.TotalRegistros ?? 0) };
}
