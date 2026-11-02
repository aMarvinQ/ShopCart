import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { esquemaId } from '../../http/esquemas.js';
import * as controlador from './direcciones.controller.js';
import { esquemaCrearDireccion, esquemaDatosDireccion, esquemaLibreta } from './direcciones.schemas.js';

const ETIQUETA = 'Direcciones';
const ROLES = ['CLIENTE'];
const NOTA = 'Devuelve la libreta completa. Una dirección de otro cliente responde 404, como si no existiera.';

documentar({
    metodo: 'get',
    ruta: '/direcciones',
    etiqueta: ETIQUETA,
    resumen: 'Mi libreta de direcciones',
    roles: ROLES,
    respuesta: esquemaLibreta,
});
documentar({
    metodo: 'post',
    ruta: '/direcciones',
    etiqueta: ETIQUETA,
    resumen: 'Agregar una dirección',
    descripcion: 'Máximo 5 activas. La primera queda predeterminada. Devuelve el ID de la nueva y la libreta.',
    roles: ROLES,
    cuerpo: esquemaCrearDireccion,
    respuesta: z.object({ idDireccion: z.number(), direcciones: esquemaLibreta }),
    estado: 201,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'put',
    ruta: '/direcciones/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Editar una dirección',
    descripcion: NOTA,
    roles: ROLES,
    params: esquemaId,
    cuerpo: esquemaDatosDireccion,
    respuesta: esquemaLibreta,
    errores: [400, 404, 422],
});
documentar({
    metodo: 'post',
    ruta: '/direcciones/{id}/predeterminada',
    etiqueta: ETIQUETA,
    resumen: 'Marcar como predeterminada',
    descripcion: NOTA,
    roles: ROLES,
    params: esquemaId,
    respuesta: esquemaLibreta,
    errores: [404],
});
documentar({
    metodo: 'delete',
    ruta: '/direcciones/{id}',
    etiqueta: ETIQUETA,
    resumen: 'Eliminar una dirección',
    descripcion: `Se desactiva (los pedidos guardan su copia). Si era la predeterminada, pasa a serlo la más reciente. ${NOTA}`,
    roles: ROLES,
    params: esquemaId,
    respuesta: esquemaLibreta,
    errores: [404],
});

export function crearRutasDirecciones({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    const cliente = [autenticar, autorizar('CLIENTE')];
    rutas.get('/direcciones', ...cliente, controlador.listar);
    rutas.post('/direcciones', ...cliente, controlador.crear);
    rutas.put('/direcciones/:id', ...cliente, controlador.actualizar);
    rutas.post('/direcciones/:id/predeterminada', ...cliente, controlador.marcarPredeterminada);
    rutas.delete('/direcciones/:id', ...cliente, controlador.eliminar);
    return rutas;
}
