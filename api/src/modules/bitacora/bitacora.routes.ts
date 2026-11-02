import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import * as controlador from './bitacora.controller.js';
import { esquemaExportarBitacora, esquemaListarBitacora, esquemaRegistroBitacora } from './bitacora.schemas.js';

documentar({
    metodo: 'get',
    ruta: '/bitacora',
    etiqueta: 'Bitácora',
    resumen: 'Consultar la bitácora',
    descripcion:
        'Del más reciente al más antiguo. Filtros por módulo, acción, autor, entidad (y su ID) y días de Guatemala. ' +
        'Es de solo lectura: nadie puede modificarla ni borrarla.',
    roles: ['ADMIN'],
    query: esquemaListarBitacora,
    respuesta: z.array(esquemaRegistroBitacora),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'get',
    ruta: '/bitacora/exportar',
    etiqueta: 'Bitácora',
    resumen: 'Descargar la bitácora filtrada (Excel)',
    descripcion: 'Mismos filtros que el listado; máximo 10 000 registros (el archivo lo indica si hay más).',
    roles: ['ADMIN'],
    query: esquemaExportarBitacora,
    errores: [400, 422],
});

export function crearRutasBitacora({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    rutas.get('/bitacora', autenticar, autorizar('ADMIN'), controlador.listar);
    rutas.get('/bitacora/exportar', autenticar, autorizar('ADMIN'), controlador.exportar);
    return rutas;
}
