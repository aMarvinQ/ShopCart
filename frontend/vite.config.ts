import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/*
    Desarrollo y vista previa: /api y /uploads van a la API por un proxy, así el navegador ve un
    solo origen y las cookies SameSite=Strict funcionan sin configuración adicional.
    En producción se sirve igual: el build estático y la API detrás del mismo dominio.
*/
const SEGURIDAD = {
    // 'unsafe-inline' solo en estilos: los componentes colocan menús con el atributo style.
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
};

export default defineConfig(({ mode }) => {
    const entorno = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
    const destino = entorno.API_URL ?? 'http://localhost:3000';
    const proxy = {
        '/api': { target: destino, changeOrigin: false },
        '/uploads': { target: destino, changeOrigin: false },
    };
    return {
        plugins: [react()],
        server: { port: 5173, strictPort: true, proxy },
        preview: { port: 4173, strictPort: true, proxy, headers: SEGURIDAD },
        css: {
            preprocessorOptions: {
                scss: {
                    // Bootstrap 5.3 aún usa @import: se silencian solo sus avisos, no los del proyecto.
                    quietDeps: true,
                    silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'if-function'],
                },
            },
        },
        test: {
            environment: 'jsdom',
            include: ['src/**/*.test.{ts,tsx}'],
            setupFiles: ['src/pruebas/configurar.ts'],
            restoreMocks: true,
        },
    };
});
