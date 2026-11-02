import { z } from '../../config/zod.js';
import { esquemaTelefono } from '../../http/esquemas.js';

/* Política de contraseña (D65): la valida la API, porque la base solo recibe el hash. */
export const esquemaContrasenaNueva = z
    .string()
    .min(8)
    .max(128)
    .regex(/\p{L}/u, 'debe incluir al menos una letra')
    .regex(/\d/, 'debe incluir al menos un número')
    .openapi({ example: 'MiClave2026', description: 'De 8 a 128 caracteres, con al menos una letra y un número.' });

export const esquemaCorreo = z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email())
    .openapi({ example: 'cliente@shopcart.test' });

export const esquemaRegistro = z.object({
    correo: esquemaCorreo,
    contrasena: esquemaContrasenaNueva,
    nombre: z.string().trim().min(1).max(100).openapi({ example: 'Ana' }),
    apellido: z.string().trim().min(1).max(100).openapi({ example: 'García' }),
    telefono: esquemaTelefono.optional(),
});

export const esquemaLogin = z.object({
    correo: esquemaCorreo,
    contrasena: z.string().min(1).max(128).openapi({ example: 'Cliente#2026' }),
});

export const esquemaCambioContrasena = z.object({
    contrasenaActual: z.string().min(1).max(128),
    contrasenaNueva: esquemaContrasenaNueva,
});

export const esquemaUsuarioSesion = z.object({
    idUsuario: z.number(),
    correo: z.string(),
    nombre: z.string(),
    apellido: z.string(),
    codigoRol: z.enum(['CLIENTE', 'OPERADOR', 'ADMIN']),
});

export const esquemaSesion = z
    .object({
        accessToken: z.string(),
        tipo: z.literal('Bearer'),
        expiraEn: z.number().openapi({ description: 'Segundos de vigencia del access token.' }),
        usuario: esquemaUsuarioSesion,
    })
    .openapi('Sesion');

export type DatosRegistro = z.infer<typeof esquemaRegistro>;
export type UsuarioSesionRespuesta = z.infer<typeof esquemaUsuarioSesion>;
export type Sesion = z.infer<typeof esquemaSesion>;
