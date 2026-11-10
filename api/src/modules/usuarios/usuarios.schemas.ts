import { z } from '../../config/zod.js';
import { booleanoQuery, esquemaOrden, esquemaPaginacion, esquemaTelefono } from '../../http/esquemas.js';
import { esquemaContrasenaNueva, esquemaCorreo } from '../auth/auth.schemas.js';

const nombre = z.string().trim().min(1).max(100);

export const esquemaActualizarPerfil = z.object({
    nombre: nombre.openapi({ example: 'María' }),
    apellido: nombre.openapi({ example: 'López' }),
    telefono: esquemaTelefono.nullable().optional(),
});

export const esquemaCrearInterno = z.object({
    correo: esquemaCorreo.openapi({ example: 'nuevo.operador@shopcart.test' }),
    contrasena: esquemaContrasenaNueva,
    nombre: nombre.openapi({ example: 'Pedro' }),
    apellido: nombre.openapi({ example: 'Álvarez' }),
    telefono: esquemaTelefono.optional(),
    rol: z.enum(['OPERADOR', 'ADMIN']),
});

/*
    El correo no se modifica (identifica la cuenta); la contraseña la cambia cada usuario.
    La edición concurrente se controla con fechaModificacion y no con versionFila: cada inicio de
    sesión cambia la versionFila del usuario sin que nadie lo haya editado.
*/
export const esquemaActualizarInterno = z.object({
    nombre: nombre.openapi({ example: 'Pedro' }),
    apellido: nombre.openapi({ example: 'Álvarez' }),
    telefono: esquemaTelefono.nullable().optional(),
    rol: z.enum(['OPERADOR', 'ADMIN']),
    fechaModificacion: z.coerce.date().openapi({
        type: 'string',
        format: 'date-time',
        description: 'La fechaModificacion de la última lectura (control de edición concurrente).',
    }),
});

export const esquemaCambiarEstado = z.object({ activo: z.boolean() });

export const esquemaListarUsuarios = esquemaPaginacion.extend({
    ...esquemaOrden(['CREACION', 'NOMBRE', 'CORREO', 'ROL', 'ACCESO', 'ESTADO'], 'CREACION', 'DESC'),
    rol: z.enum(['CLIENTE', 'OPERADOR', 'ADMIN']).optional(),
    activo: booleanoQuery.optional(),
    busqueda: z.string().trim().max(100).optional().openapi({ description: 'Correo o nombre completo (contiene).' }),
});

export const esquemaPerfil = z
    .object({
        idUsuario: z.number(),
        correo: z.string(),
        nombre: z.string(),
        apellido: z.string(),
        telefono: z.string().nullable(),
        codigoRol: z.string(),
        nombreRol: z.string(),
        ultimoAcceso: z.string().nullable(),
        fechaCreacion: z.string(),
    })
    .openapi('Perfil');

export const esquemaUsuario = esquemaPerfil.extend({ activo: z.boolean() }).openapi('Usuario');

const fechaModificacion = z
    .string()
    .openapi({ description: 'Enviar en la siguiente edición (control de edición concurrente).' });

/** Como lo devuelven el listado y el alta: con la fecha de modificación para editarlo. */
export const esquemaUsuarioEditable = esquemaUsuario.extend({ fechaModificacion }).openapi('UsuarioEditable');

export const esquemaUsuarioEditado = esquemaUsuarioEditable
    .extend({ sesionesRevocadas: z.number() })
    .openapi('UsuarioEditado');

export const esquemaUsuarioEstado = esquemaUsuario
    .extend({ estadoCambiado: z.boolean(), sesionesRevocadas: z.number() })
    .openapi('UsuarioEstado');
