import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import * as controlador from './envios.controller.js';
import { esquemaDepartamento, esquemaIdDepartamento, esquemaMunicipio } from './envios.schemas.js';

/* Catálogos públicos para los formularios de dirección (cliente e invitado). */
const ETIQUETA = 'Envíos';

documentar({
    metodo: 'get',
    ruta: '/departamentos',
    etiqueta: ETIQUETA,
    resumen: 'Departamentos de Guatemala',
    respuesta: z.array(esquemaDepartamento),
});
documentar({
    metodo: 'get',
    ruta: '/departamentos/{id}/municipios',
    etiqueta: ETIQUETA,
    resumen: 'Municipios de un departamento',
    descripcion: 'idMunicipio es el código INE (DDMM, p. ej. 108 = Mixco).',
    params: esquemaIdDepartamento,
    respuesta: z.array(esquemaMunicipio),
    errores: [400, 404],
});

export function crearRutasEnvios(): Router {
    const rutas = Router();
    rutas.get('/departamentos', controlador.listarDepartamentos);
    rutas.get('/departamentos/:id/municipios', controlador.listarMunicipios);
    return rutas;
}
