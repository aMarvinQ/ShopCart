import { existsSync } from 'node:fs';

/*
    Las pruebas usan la base de pruebas (D61), nunca la principal: DB_NOMBRE se reemplaza por
    DB_NOMBRE_PRUEBAS y la configuración rechaza ShopCart en NODE_ENV=test.
    El límite de intentos se desactiva (muchos registros y logins seguidos); su prueba crea una
    app con el límite activo. Las variables ya definidas en el entorno tienen prioridad sobre .env.
*/
if (existsSync('.env')) process.loadEnvFile('.env');
process.env.NODE_ENV = 'test';
process.env.DB_NOMBRE = process.env.DB_NOMBRE_PRUEBAS ?? 'ShopCart_Pruebas';
process.env.LIMITE_INTENTOS = 'inactivo';
