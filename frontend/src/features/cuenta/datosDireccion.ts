import { z } from 'zod';
import type { DatosDe } from '../../api/cliente';

export type Direccion = DatosDe<'get', '/direcciones'>[number];

const texto = (mensaje: string, maximo: number) =>
    z
        .string()
        .trim()
        .min(1, mensaje)
        .max(maximo, `Máximo ${String(maximo)} caracteres.`);

export const esquemaAlias = texto('Ponle un nombre, como Casa.', 50);

/* Los campos de una dirección: los usan la libreta y la compra como invitado. */
export const esquemaCamposDireccion = z.object({
    nombreDestinatario: texto('Escribe quién recibe.', 150),
    telefono: z
        .string()
        .trim()
        .min(8, 'Debe tener al menos 8 dígitos.')
        .max(20, 'Máximo 20 caracteres.')
        .regex(/^[0-9+\- ]+$/, 'Usa solo dígitos, espacios, + y -.'),
    linea1: texto('Escribe la dirección.', 200),
    linea2: z.string().trim().max(200, 'Máximo 200 caracteres.'),
    idDepartamento: z.string().min(1, 'Elige el departamento.'),
    idMunicipio: z.string().min(1, 'Elige el municipio.'),
    codigoPostal: z
        .string()
        .trim()
        .regex(/^(\d{5})?$/, 'Deben ser 5 dígitos.'),
    referencias: z.string().trim().max(300, 'Máximo 300 caracteres.'),
});
export type DatosCamposDireccion = z.infer<typeof esquemaCamposDireccion>;

export const CAMPOS_DIRECCION_API = [
    'nombreDestinatario',
    'telefono',
    'linea1',
    'linea2',
    'idMunicipio',
    'codigoPostal',
    'referencias',
] as const;

export const valoresDireccion = (direccion?: Direccion | null): DatosCamposDireccion => ({
    nombreDestinatario: direccion?.nombreDestinatario ?? '',
    telefono: direccion?.telefono ?? '',
    linea1: direccion?.linea1 ?? '',
    linea2: direccion?.linea2 ?? '',
    idDepartamento: direccion ? String(direccion.idDepartamento) : '',
    idMunicipio: direccion ? String(direccion.idMunicipio) : '',
    codigoPostal: direccion?.codigoPostal ?? '',
    referencias: direccion?.referencias ?? '',
});

/** Lo que espera la API: sin departamento (lo deduce del municipio) y con null en lo opcional vacío. */
export const cuerpoDireccion = (datos: DatosCamposDireccion) => ({
    nombreDestinatario: datos.nombreDestinatario,
    telefono: datos.telefono,
    linea1: datos.linea1,
    linea2: datos.linea2 || null,
    idMunicipio: Number(datos.idMunicipio),
    codigoPostal: datos.codigoPostal || null,
    referencias: datos.referencias || null,
});
