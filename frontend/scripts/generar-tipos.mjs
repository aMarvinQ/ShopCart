import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

/*
    Genera src/api/esquema.d.ts a partir del OpenAPI de la API: los mismos esquemas que validan
    las peticiones. Si la API cambia, el frontend no compila hasta adaptarse.
    --verificar: falla si el archivo versionado no coincide (no escribe nada).
*/
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const api = path.resolve(raiz, '../api');
const destino = path.join(raiz, 'src/api/esquema.d.ts');
const verificar = process.argv.includes('--verificar');
const normalizar = (texto) => texto.replace(/\r\n/g, '\n');

if (!existsSync(path.join(api, 'node_modules'))) {
    console.error('Instala primero las dependencias de la API (npm install en api/).');
    process.exit(1);
}

const carpeta = mkdtempSync(path.join(tmpdir(), 'shopcart-openapi-'));
try {
    const documento = path.join(carpeta, 'openapi.json');
    execFileSync(process.execPath, ['--import', 'tsx', 'src/docs/exportar-openapi.ts', documento], {
        cwd: api,
        stdio: 'inherit',
    });
    const ast = await openapiTS(pathToFileURL(documento));
    const generado = `/* Generado por npm run tipos a partir del OpenAPI de la API. No editar a mano. */\n${astToString(ast)}`;

    if (verificar) {
        const actual = existsSync(destino) ? normalizar(readFileSync(destino, 'utf8')) : '';
        if (actual !== normalizar(generado)) {
            console.error('src/api/esquema.d.ts no coincide con la API: ejecuta npm run tipos.');
            process.exit(1);
        }
        console.log('Tipos de la API al día.');
    } else {
        writeFileSync(destino, generado);
        console.log(`Tipos generados en ${path.relative(raiz, destino)}.`);
    }
} finally {
    rmSync(carpeta, { recursive: true, force: true });
}
