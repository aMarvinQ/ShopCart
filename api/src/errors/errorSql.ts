import { numeroErrorSql } from '../db/index.js';
import { ErrorApi } from './ErrorApi.js';

/*
    Traduce un error de SQL Server a la respuesta HTTP (docs/errores.md). Los SPs lanzan los
    errores de negocio con THROW <número>, N'CODIGO: descripción': el rango del número decide
    el estado y el código viaja tal cual. Lo que no es un error de negocio no expone su detalle.
    Devuelve null si no es un error de la base: el manejador lo trata como error interno.
*/
const RANGOS: { desde: number; hasta: number; estado: number }[] = [
    { desde: 50001, hasta: 50099, estado: 422 }, // validación de datos
    { desde: 50100, hasta: 50199, estado: 404 }, // no encontrado
    { desde: 50200, hasta: 50299, estado: 403 }, // permiso o propiedad
    { desde: 50300, hasta: 50399, estado: 401 }, // autenticación
    { desde: 51000, hasta: 51999, estado: 409 }, // conflicto de negocio
];

const FORMATO_NEGOCIO = /^([A-Z][A-Z0-9_]*):\s*([\s\S]*)$/;
const CODIGOS_CONEXION = new Set(['ESOCKET', 'ELOGIN', 'ETIMEOUT', 'ECONNCLOSED', 'ENOTOPEN']);

function codigoConexion(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string')
        return error.code;
    return undefined;
}

export function traducirErrorSql(error: unknown): ErrorApi | null {
    const numero = numeroErrorSql(error);
    const mensaje = error instanceof Error ? error.message : '';

    if (numero !== undefined && numero >= 50000 && numero <= 59999) {
        const negocio = FORMATO_NEGOCIO.exec(mensaje);
        const rango = RANGOS.find((r) => numero >= r.desde && numero <= r.hasta);
        if (negocio?.[1] && rango) return new ErrorApi(rango.estado, negocio[1], negocio[2] ?? '');
        // 59xxx: falta configuración de la base (semilla incompleta). Es un error del servidor.
        if (numero >= 59000) {
            return new ErrorApi(500, 'CONFIGURACION_INCOMPLETA', 'La configuración del sistema está incompleta.');
        }
        return null;
    }

    switch (numero) {
        case 2601:
        case 2627:
            return new ErrorApi(409, 'REGISTRO_DUPLICADO', 'Ya existe un registro con esos datos.');
        case 547:
            return new ErrorApi(
                409,
                'RESTRICCION_VIOLADA',
                'La operación no cumple una regla de integridad de los datos.',
            );
        case 1205:
            return new ErrorApi(503, 'SERVICIO_OCUPADO', 'El sistema está ocupado; intenta de nuevo.');
        default:
            break;
    }

    const codigo = codigoConexion(error);
    if (codigo && CODIGOS_CONEXION.has(codigo)) {
        return new ErrorApi(503, 'BASE_DATOS_NO_DISPONIBLE', 'La base de datos no está disponible en este momento.');
    }
    return null;
}
