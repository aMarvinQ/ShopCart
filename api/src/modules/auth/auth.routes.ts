import { Router } from 'express';
import { z } from '../../config/zod.js';
import { documentar } from '../../docs/openapi.js';
import type { DependenciasRutas } from '../../http/dependencias.js';
import { crearControladorAuth } from './auth.controller.js';
import { esquemaCambioContrasena, esquemaLogin, esquemaRegistro, esquemaSesion } from './auth.schemas.js';
import { crearServicioAuth } from './auth.service.js';

const ETIQUETA = 'Autenticación';

documentar({
    metodo: 'post',
    ruta: '/auth/registro',
    etiqueta: ETIQUETA,
    resumen: 'Registrar un cliente',
    descripcion:
        'Crea la cuenta e inicia la sesión: devuelve el access token y deja el refresh token en una cookie httpOnly. Si había un carrito de invitado, sus productos pasan al de la cuenta. Límite: 5 registros por hora por IP.',
    cuerpo: esquemaRegistro,
    respuesta: esquemaSesion,
    estado: 201,
    errores: [400, 409, 422, 429],
});
documentar({
    metodo: 'post',
    ruta: '/auth/login',
    etiqueta: ETIQUETA,
    resumen: 'Iniciar sesión',
    descripcion:
        'Responde lo mismo si el correo no existe o la contraseña es incorrecta (CREDENCIALES_INVALIDAS). Si había un carrito de invitado, sus productos pasan al del cliente. Límite: 10 intentos fallidos por correo cada 15 minutos.',
    cuerpo: esquemaLogin,
    respuesta: esquemaSesion,
    errores: [400, 401, 429],
});
documentar({
    metodo: 'post',
    ruta: '/auth/refresh',
    etiqueta: ETIQUETA,
    resumen: 'Renovar la sesión',
    descripcion:
        'Usa la cookie del refresh token y la rota (el anterior queda revocado). Si se presenta un token ya rotado, se cierra toda la sesión (REUSO_DETECTADO).',
    respuesta: esquemaSesion,
    errores: [401, 429],
});
documentar({
    metodo: 'post',
    ruta: '/auth/logout',
    etiqueta: ETIQUETA,
    resumen: 'Cerrar sesión',
    descripcion: 'Revoca la sesión de la cookie y la borra. Siempre responde 204.',
    estado: 204,
});
documentar({
    metodo: 'post',
    ruta: '/auth/cambiar-contrasena',
    etiqueta: ETIQUETA,
    resumen: 'Cambiar la contraseña',
    descripcion: 'Verifica la contraseña actual y cierra las demás sesiones; la actual sigue abierta.',
    autenticado: true,
    cuerpo: esquemaCambioContrasena,
    respuesta: z.object({ sesionesCerradas: z.number() }),
    errores: [400, 422],
});

export function crearRutasAuth({ config, tokens, autenticacion, limites }: DependenciasRutas): Router {
    const controlador = crearControladorAuth(crearServicioAuth(tokens), config);
    const rutas = Router();
    rutas.post('/auth/registro', limites.registro, controlador.registrar);
    rutas.post('/auth/login', ...limites.login, controlador.iniciarSesion);
    rutas.post('/auth/refresh', limites.refresh, controlador.renovar);
    rutas.post('/auth/logout', controlador.cerrarSesion);
    rutas.post('/auth/cambiar-contrasena', autenticacion.autenticar, controlador.cambiarContrasena);
    return rutas;
}
