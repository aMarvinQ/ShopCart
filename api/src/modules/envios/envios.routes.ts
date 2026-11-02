import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { esquemaId } from '../../http/esquemas.js';
import { esquemaEstado } from '../catalogo/catalogo.schemas.js';
import * as controlador from './envios.controller.js';
import {
    esquemaActualizarMetodo,
    esquemaDatosMetodo,
    esquemaDepartamento,
    esquemaIdDepartamento,
    esquemaMetodo,
    esquemaMetodoTienda,
    esquemaMunicipio,
} from './envios.schemas.js';

const ETIQUETA = 'Envíos';
const ROLES = ['ADMIN'];

/* --- Públicos: formularios de dirección y elección del envío (cliente e invitado) --- */
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
documentar({
    metodo: 'get',
    ruta: '/tienda/metodos-envio',
    etiqueta: ETIQUETA,
    resumen: 'Métodos de envío disponibles',
    descripcion: 'Activos, del más barato al más caro.',
    respuesta: z.array(esquemaMetodoTienda),
});

/* --- Administración (ADMIN) --- */
documentar({
    metodo: 'get',
    ruta: '/metodos-envio',
    etiqueta: ETIQUETA,
    resumen: 'Listar métodos de envío (activos e inactivos)',
    roles: ROLES,
    respuesta: z.array(esquemaMetodo),
});
documentar({
    metodo: 'get',
    ruta: '/metodos-envio/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Ver un método de envío (con versionFila y pedidos que lo usaron)',
    roles: ROLES,
    params: esquemaId,
    respuesta: esquemaMetodo,
    errores: [404],
});
documentar({
    metodo: 'post',
    ruta: '/metodos-envio',
    etiqueta: ETIQUETA,
    resumen: 'Crear un método de envío',
    roles: ROLES,
    cuerpo: esquemaDatosMetodo,
    respuesta: esquemaMetodo,
    estado: 201,
    errores: [400, 409, 422],
});
documentar({
    metodo: 'put',
    ruta: '/metodos-envio/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Editar un método de envío',
    descripcion:
        'Un costo nuevo aplica a los checkouts que se inicien después; los pedidos conservan el que pagaron. ' +
        'Envía la versionFila de la última lectura (409 EDICION_CONCURRENTE).',
    roles: ROLES,
    params: esquemaId,
    cuerpo: esquemaActualizarMetodo,
    respuesta: esquemaMetodo,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'patch',
    ruta: '/metodos-envio/{id}/estado',
    etiqueta: ETIQUETA,
    resumen: 'Activar o desactivar un método de envío',
    descripcion: 'No se puede desactivar el último activo: la tienda no podría vender (409 ULTIMO_METODO_ENVIO).',
    roles: ROLES,
    params: esquemaId,
    cuerpo: esquemaEstado,
    respuesta: esquemaMetodo,
    errores: [400, 404, 409],
});

export function crearRutasEnvios({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    const admin = [autenticar, autorizar('ADMIN')];
    rutas.get('/departamentos', controlador.listarDepartamentos);
    rutas.get('/departamentos/:id/municipios', controlador.listarMunicipios);
    rutas.get('/tienda/metodos-envio', controlador.listarMetodosTienda);
    rutas.get('/metodos-envio', ...admin, controlador.listarMetodos);
    rutas.get('/metodos-envio/:id', ...admin, controlador.obtenerMetodo);
    rutas.post('/metodos-envio', ...admin, controlador.crearMetodo);
    rutas.put('/metodos-envio/:id', ...admin, controlador.actualizarMetodo);
    rutas.patch('/metodos-envio/:id/estado', ...admin, controlador.cambiarEstadoMetodo);
    return rutas;
}
