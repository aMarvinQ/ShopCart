import { describe, expect, it } from 'vitest';
import { cargarConfiguracion, ConfiguracionInvalidaError } from '../../src/config/configuracion.js';

const valida = {
    NODE_ENV: 'development',
    DB_SERVIDOR: 'localhost',
    DB_PUERTO: '14330',
    DB_NOMBRE: 'ShopCart',
    DB_USUARIO: 'shopcart_api',
    DB_CONTRASENA: 'una-contrasena-segura',
    JWT_SECRETO: 'x'.repeat(32),
    CORS_ORIGENES: 'http://localhost:5173, https://tienda.example',
};

function problemas(entorno: Record<string, string | undefined>): string[] {
    try {
        cargarConfiguracion(entorno);
    } catch (error) {
        if (error instanceof ConfiguracionInvalidaError) return error.problemas;
        throw error;
    }
    return [];
}

describe('configuración', () => {
    it('convierte y completa los valores por defecto', () => {
        const config = cargarConfiguracion(valida);
        expect(config.DB_PUERTO).toBe(14330);
        expect(config.PUERTO).toBe(3000);
        expect(config.JWT_ACCESO_MINUTOS).toBe(15);
        expect(config.DB_CONFIAR_CERTIFICADO).toBe(false);
        expect(config.CORS_ORIGENES).toEqual(['http://localhost:5173', 'https://tienda.example']);
    });

    it('rechaza la falta de la contraseña y un secreto JWT corto, indicando el campo sin mostrar el valor', () => {
        const encontrados = problemas({ ...valida, DB_CONTRASENA: undefined, JWT_SECRETO: 'corto' });
        expect(encontrados.some((p) => p.startsWith('DB_CONTRASENA'))).toBe(true);
        expect(encontrados.some((p) => p.startsWith('JWT_SECRETO'))).toBe(true);
        expect(encontrados.join(' ')).not.toContain('corto');
    });

    it('rechaza un nombre de base fuera del patrón y un origen CORS que no es URL', () => {
        const encontrados = problemas({ ...valida, DB_NOMBRE: 'master', CORS_ORIGENES: 'no-es-url' });
        expect(encontrados.some((p) => p.startsWith('DB_NOMBRE'))).toBe(true);
        expect(encontrados.some((p) => p.startsWith('CORS_ORIGENES'))).toBe(true);
    });

    it('no permite ejecutar las pruebas sobre la base principal', () => {
        expect(problemas({ ...valida, NODE_ENV: 'test', DB_NOMBRE: 'ShopCart' })[0]).toMatch(/^DB_NOMBRE/);
        expect(problemas({ ...valida, NODE_ENV: 'test', DB_NOMBRE: 'ShopCart_Pruebas' })).toEqual([]);
    });
});
