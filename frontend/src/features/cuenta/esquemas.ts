import { z } from 'zod';
import { MENSAJE_TELEFONO, PATRON_TELEFONO } from '../../utils/telefono';

/* Mismas reglas de la API, para avisar antes de enviar. Quien decide sigue siendo la API. */
const nombre = (mensaje: string) => z.string().trim().min(1, mensaje).max(100, 'Máximo 100 caracteres.');

export const esquemaNombre = nombre('Escribe tu nombre.');
export const esquemaApellido = nombre('Escribe tu apellido.');
/** Opcional: vacío, o los 8 dígitos de un teléfono de Guatemala. */
export const esquemaTelefono = z
    .string()
    .trim()
    .refine((texto) => texto === '' || PATRON_TELEFONO.test(texto), MENSAJE_TELEFONO);
export const esquemaContrasenaNueva = z
    .string()
    .min(8, 'Debe tener al menos 8 caracteres.')
    .max(128, 'Máximo 128 caracteres.')
    .regex(/\p{L}/u, 'Debe incluir al menos una letra.')
    .regex(/\d/, 'Debe incluir al menos un número.');

export const AYUDA_CONTRASENA = 'Mínimo 8 caracteres, con una letra y un número.';
