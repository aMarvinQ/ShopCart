import { writeFileSync } from 'node:fs';
import '../app.js';
import { generarDocumento } from './openapi.js';

/*
    Escribe el documento OpenAPI en un archivo, sin levantar la API ni conectarse a la base: las
    rutas se registran al importar sus módulos. Lo usa el frontend para generar sus tipos.
    Uso: tsx src/docs/exportar-openapi.ts <archivo>
*/
const destino = process.argv[2];
if (!destino) {
    console.error('Indica el archivo de destino.');
    process.exit(1);
}
writeFileSync(destino, JSON.stringify(generarDocumento(), null, 2));
