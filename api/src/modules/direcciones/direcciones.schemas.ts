import { z } from '../../config/zod.js';
import { esquemaTelefono } from '../../http/esquemas.js';

const textoOpcional = (maximo: number) =>
    z
        .string()
        .trim()
        .max(maximo)
        .transform((valor) => valor || null)
        .nullable()
        .optional();

export const esquemaDatosDireccion = z.object({
    alias: z.string().trim().min(1).max(50).openapi({ example: 'Casa' }),
    nombreDestinatario: z.string().trim().min(1).max(150).openapi({ example: 'María López' }),
    telefono: esquemaTelefono,
    linea1: z.string().trim().min(1).max(200).openapi({ example: '4a calle 5-20 zona 1' }),
    linea2: textoOpcional(200),
    idMunicipio: z
        .number()
        .int()
        .min(101)
        .max(2299)
        .openapi({ example: 108, description: 'Código INE del municipio.' }),
    codigoPostal: z
        .string()
        .trim()
        .regex(/^\d{5}$/, 'deben ser 5 dígitos')
        .nullable()
        .optional(),
    referencias: textoOpcional(300),
});

export const esquemaCrearDireccion = esquemaDatosDireccion.extend({
    esPredeterminada: z.boolean().default(false),
});

export const esquemaDireccion = z
    .object({
        idDireccion: z.number(),
        alias: z.string(),
        nombreDestinatario: z.string(),
        telefono: z.string(),
        linea1: z.string(),
        linea2: z.string().nullable(),
        idMunicipio: z.number(),
        municipio: z.string(),
        idDepartamento: z.number(),
        departamento: z.string(),
        codigoPostal: z.string().nullable(),
        referencias: z.string().nullable(),
        esPredeterminada: z.boolean(),
        fechaCreacion: z.string(),
        fechaModificacion: z.string().nullable(),
    })
    .openapi('Direccion');

export const esquemaLibreta = z.array(esquemaDireccion);

export type DatosDireccion = z.infer<typeof esquemaDatosDireccion>;
