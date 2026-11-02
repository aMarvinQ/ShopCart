import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/*
    Las pruebas usan la base de pruebas (D61), nunca la principal: DB_NOMBRE se reemplaza por
    DB_NOMBRE_PRUEBAS y la configuración rechaza ShopCart en NODE_ENV=test.
    El límite de intentos se desactiva (muchos registros y logins seguidos); su prueba crea una
    app con el límite activo. Las imágenes subidas van a una carpeta temporal.
    Las variables ya definidas en el entorno tienen prioridad sobre .env.
*/
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.DB_NOMBRE = process.env.DB_NOMBRE_PRUEBAS ?? 'ShopCart_Pruebas';
process.env.LIMITE_INTENTOS = 'inactivo';
// Las imágenes que suben las pruebas van a una carpeta temporal, no a uploads/ del proyecto.
process.env.CARPETA_UPLOADS = path.join(tmpdir(), 'shopcart-pruebas-uploads');
