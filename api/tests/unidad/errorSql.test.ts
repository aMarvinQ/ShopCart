import { describe, expect, it } from 'vitest';
import { traducirErrorSql } from '../../src/errors/errorSql.js';

// Forma de los errores de mssql: Error con "number" (SQL Server) o "code" (conexión).
function errorSql(numero: number, mensaje: string): Error {
    return Object.assign(new Error(mensaje), { number: numero });
}

describe('traducción de errores de SQL Server (docs/errores.md)', () => {
    it.each([
        [50015, 'PRECIO_INVALIDO', 422],
        [50116, 'PEDIDO_NO_ENCONTRADO', 404],
        [50201, 'PERMISO_DENEGADO', 403],
        [50301, 'USUARIO_INACTIVO', 401],
        [51301, 'STOCK_INSUFICIENTE', 409],
    ])('%i %s → %i con su código y descripción', (numero, codigo, estado) => {
        const error = traducirErrorSql(errorSql(numero, `${codigo}: descripción del SP.`));
        expect(error?.estado).toBe(estado);
        expect(error?.codigo).toBe(codigo);
        expect(error?.message).toBe('descripción del SP.');
    });

    it('59xxx (configuración incompleta) → 500 sin el detalle interno', () => {
        const error = traducirErrorSql(errorSql(59001, 'CONFIGURACION_INCOMPLETA: falta el parámetro TASA_IVA.'));
        expect(error?.estado).toBe(500);
        expect(error?.codigo).toBe('CONFIGURACION_INCOMPLETA');
        expect(error?.message).not.toContain('TASA_IVA');
    });

    it('duplicados, restricciones y deadlock no previstos por el SP', () => {
        expect(traducirErrorSql(errorSql(2627, 'Violation of UNIQUE KEY constraint ...'))?.estado).toBe(409);
        expect(traducirErrorSql(errorSql(547, 'The INSERT statement conflicted ...'))?.codigo).toBe(
            'RESTRICCION_VIOLADA',
        );
        expect(traducirErrorSql(errorSql(1205, 'Transaction was deadlocked ...'))?.estado).toBe(503);
    });

    it('base no disponible → 503', () => {
        const error = traducirErrorSql(Object.assign(new Error('Failed to connect'), { code: 'ESOCKET' }));
        expect(error?.codigo).toBe('BASE_DATOS_NO_DISPONIBLE');
    });

    it('un error que no es de negocio ni conocido no se traduce (el manejador responde 500 sin detalle)', () => {
        expect(traducirErrorSql(errorSql(208, "Invalid object name 'dbo.X'."))).toBeNull();
        expect(traducirErrorSql(errorSql(50020, 'mensaje sin código'))).toBeNull();
        expect(traducirErrorSql(new TypeError('x is undefined'))).toBeNull();
    });
});
