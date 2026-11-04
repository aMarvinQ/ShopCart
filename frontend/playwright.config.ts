import { defineConfig, devices } from '@playwright/test';

/*
    Pruebas de extremo a extremo: la app compilada (con las cabeceras de seguridad de producción)
    contra la API real y la base de pruebas, en escritorio y móvil.
    Requiere ShopCart_Pruebas desplegada (ver README) y api/.env configurado.
*/
const PUERTO_API = 3100;
const PUERTO_WEB = 4174;

export default defineConfig({
    testDir: 'tests/e2e',
    fullyParallel: false,
    workers: 1,
    forbidOnly: true,
    retries: 0,
    reporter: [['list']],
    use: { baseURL: `http://localhost:${String(PUERTO_WEB)}`, trace: 'retain-on-failure' },
    projects: [
        { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
        { name: 'movil', use: { ...devices['Pixel 7'] } },
    ],
    webServer: [
        {
            command: 'npx tsx src/server.ts',
            cwd: '../api',
            url: `http://localhost:${String(PUERTO_API)}/api/v1/health`,
            reuseExistingServer: false,
            timeout: 60_000,
            env: {
                NODE_ENV: 'test',
                PUERTO: String(PUERTO_API),
                DB_NOMBRE: process.env.DB_NOMBRE_PRUEBAS ?? 'ShopCart_Pruebas',
                LIMITE_INTENTOS: 'inactivo',
            },
        },
        {
            command: `npx vite build && npx vite preview --port ${String(PUERTO_WEB)}`,
            url: `http://localhost:${String(PUERTO_WEB)}`,
            reuseExistingServer: false,
            timeout: 120_000,
            env: { API_URL: `http://localhost:${String(PUERTO_API)}` },
        },
    ],
});
