import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';
import type { Rol } from '../../seguridad/tokens.js';
import type { DatosRegistro } from './auth.schemas.js';

/* Contexto del cliente que se guarda con cada sesión (auditoría de sesiones). */
export interface ContextoCliente {
    ip: string | undefined;
    agente: string | undefined;
}

export interface Credenciales {
    idUsuario: number;
    hashContrasena: string | null;
    codigoRol: Rol;
    activo: boolean;
}

export interface UsuarioSesionFila {
    idUsuario: number;
    correo: string;
    nombre: string;
    apellido: string;
    codigoRol: Rol;
}

export interface SesionIniciadaFila extends UsuarioSesionFila {
    fechaExpiracion: Date;
    fechaExpiracionSesion: Date;
}

export type ResultadoRotacion =
    'ROTADO' | 'ROTACION_CONCURRENTE' | 'REUSO_DETECTADO' | 'SESION_EXPIRADA' | 'USUARIO_INACTIVO' | 'SESION_INVALIDA';

export interface RotacionFila extends Partial<UsuarioSesionFila> {
    resultado: ResultadoRotacion;
    fechaExpiracion: Date | null;
    fechaExpiracionSesion: Date | null;
}

const contexto = ({ ip, agente }: ContextoCliente) => ({
    DireccionIP: { tipo: TipoSql.VarChar(45), valor: ip?.slice(0, 45) ?? null },
    AgenteUsuario: { tipo: TipoSql.NVarChar(1000), valor: agente?.slice(0, 1000) ?? null },
});

export async function registrarCliente(datos: DatosRegistro, hash: string): Promise<UsuarioSesionFila> {
    const { filas } = await ejecutarProcedimiento<UsuarioSesionFila>('SP_Seguridad_RegistrarCliente', {
        Correo: { tipo: TipoSql.NVarChar(255), valor: datos.correo },
        HashContrasena: { tipo: TipoSql.VarChar(256), valor: hash },
        Nombre: { tipo: TipoSql.NVarChar(101), valor: datos.nombre },
        Apellido: { tipo: TipoSql.NVarChar(101), valor: datos.apellido },
        Telefono: { tipo: TipoSql.NVarChar(21), valor: datos.telefono ?? null },
    });
    return filas[0] as UsuarioSesionFila;
}

export async function obtenerCredenciales(
    filtro: { correo: string } | { idUsuario: number },
): Promise<Credenciales | undefined> {
    const { filas } = await ejecutarProcedimiento<Credenciales>(
        'SP_Seguridad_ObtenerCredenciales',
        'correo' in filtro
            ? { Correo: { tipo: TipoSql.NVarChar(255), valor: filtro.correo } }
            : { IDUsuario: { tipo: TipoSql.Int, valor: filtro.idUsuario } },
        { reintentable: true },
    );
    return filas[0];
}

export async function iniciarSesion(
    idUsuario: number,
    tokenHash: Buffer,
    cliente: ContextoCliente,
): Promise<SesionIniciadaFila> {
    const { filas } = await ejecutarProcedimiento<SesionIniciadaFila>('SP_Seguridad_IniciarSesion', {
        IDUsuario: { tipo: TipoSql.Int, valor: idUsuario },
        TokenHash: { tipo: TipoSql.VarBinary(64), valor: tokenHash },
        ...contexto(cliente),
    });
    return filas[0] as SesionIniciadaFila;
}

export async function rotarSesion(actual: Buffer, nuevo: Buffer, cliente: ContextoCliente): Promise<RotacionFila> {
    const { filas } = await ejecutarProcedimiento<RotacionFila>('SP_Seguridad_RotarSesion', {
        TokenHashActual: { tipo: TipoSql.VarBinary(64), valor: actual },
        TokenHashNuevo: { tipo: TipoSql.VarBinary(64), valor: nuevo },
        ...contexto(cliente),
    });
    return filas[0] as RotacionFila;
}

export async function cerrarSesion(tokenHash: Buffer): Promise<void> {
    await ejecutarProcedimiento('SP_Seguridad_CerrarSesion', {
        TokenHash: { tipo: TipoSql.VarBinary(64), valor: tokenHash },
    });
}

export async function cambiarContrasena(
    idUsuario: number,
    hash: string,
    tokenHashActual: Buffer | null,
): Promise<number> {
    const { filas } = await ejecutarProcedimiento<{ sesionesCerradas: number }>('SP_Seguridad_CambiarContrasena', {
        IDUsuarioSolicitante: { tipo: TipoSql.Int, valor: idUsuario },
        HashContrasena: { tipo: TipoSql.VarChar(256), valor: hash },
        TokenHashActual: { tipo: TipoSql.VarBinary(64), valor: tokenHashActual },
    });
    return filas[0]?.sesionesCerradas ?? 0;
}
