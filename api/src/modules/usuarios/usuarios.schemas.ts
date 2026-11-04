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

export const esquemaUsuarioEstado = esquemaUsuario
    .extend({ estadoCambiado: z.boolean(), sesionesRevocadas: z.number() })
    .openapi('UsuarioEstado');
