import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import { esquemaId } from '../../http/esquemas.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import * as controlador from './usuarios.controller.js';
import {
    esquemaActualizarInterno,
    esquemaActualizarPerfil,
    esquemaCambiarEstado,
    esquemaCrearInterno,
    esquemaListarUsuarios,
    esquemaPerfil,
    esquemaUsuarioEditable,
    esquemaUsuarioEditado,
    esquemaUsuarioEstado,
} from './usuarios.schemas.js';

documentar({
    metodo: 'get',
    ruta: '/perfil',
    etiqueta: 'Perfil',
    resumen: 'Ver mi perfil',
    autenticado: true,
    respuesta: esquemaPerfil,
    errores: [404],
});
documentar({
    metodo: 'put',
    ruta: '/perfil',
    etiqueta: 'Perfil',
    resumen: 'Actualizar mi perfil',
    descripcion: 'Nombre, apellido y teléfono. El correo no se modifica: identifica la cuenta.',
    autenticado: true,
    cuerpo: esquemaActualizarPerfil,
    respuesta: esquemaPerfil,
    errores: [400, 404, 422],
});
documentar({
    metodo: 'get',
    ruta: '/usuarios',
    etiqueta: 'Usuarios',
    resumen: 'Listar usuarios',
    roles: ['ADMIN'],
    query: esquemaListarUsuarios,
    respuesta: z.array(esquemaUsuarioEditable),
    conMeta: true,
    errores: [400, 422],
});
documentar({
    metodo: 'post',
    ruta: '/usuarios',
    etiqueta: 'Usuarios',
    resumen: 'Crear un operador o administrador',
    descripcion: 'Los clientes se registran solos en /auth/registro.',
    roles: ['ADMIN'],
    cuerpo: esquemaCrearInterno,
    respuesta: esquemaUsuarioEditable,
    estado: 201,
    errores: [400, 409, 422],
});
documentar({
    metodo: 'put',
    ruta: '/usuarios/{id}',
    etiqueta: 'Usuarios',
    resumen: 'Editar un operador o administrador',
    descripcion:
        'Nombre, apellido, teléfono y rol. El correo no se modifica y los clientes editan su propio perfil. ' +
        'Cambiar el rol revoca sus sesiones. Un administrador no puede quitarse su propio rol. ' +
        'Envía la fechaModificacion de la última lectura: si otro usuario guardó cambios después, ' +
        'responde 409 EDICION_CONCURRENTE (iniciar sesión no cuenta como cambio).',
    roles: ['ADMIN'],
    params: esquemaId,
    cuerpo: esquemaActualizarInterno,
    respuesta: esquemaUsuarioEditado,
    errores: [400, 404, 409, 422],
});
documentar({
    metodo: 'patch',
    ruta: '/usuarios/{id}/estado',
    etiqueta: 'Usuarios',
    resumen: 'Activar o desactivar un usuario',
    descripcion:
        'Nunca se elimina. Desactivar revoca todas sus sesiones. Un administrador no puede desactivarse a sí mismo.',
    roles: ['ADMIN'],
    params: esquemaId,
    cuerpo: esquemaCambiarEstado,
    respuesta: esquemaUsuarioEstado,
    errores: [400, 404, 409],
});

export function crearRutasUsuarios({ autenticacion: { autenticar, autorizar } }: DependenciasRutas): Router {
    const rutas = Router();
    rutas.get('/perfil', autenticar, controlador.obtenerPerfil);
    rutas.put('/perfil', autenticar, controlador.actualizarPerfil);
    rutas.get('/usuarios', autenticar, autorizar('ADMIN'), controlador.listar);
    rutas.post('/usuarios', autenticar, autorizar('ADMIN'), controlador.crearInterno);
    rutas.put('/usuarios/:id', autenticar, autorizar('ADMIN'), controlador.actualizarInterno);
    rutas.patch('/usuarios/:id/estado', autenticar, autorizar('ADMIN'), controlador.cambiarEstado);
    return rutas;
}
