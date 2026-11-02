import { z } from '../../config/zod.js';
import { esquemaPaginacion } from '../../http/esquemas.js';
import { esquemaDia } from '../reportes/reportes.schemas.js';

/* Las mismas listas que CK_Bitacora_Modulo y CK_Bitacora_Accion. */
export const MODULOS = ['CATALOGO', 'INVENTARIO', 'CUPONES', 'PEDIDOS', 'USUARIOS', 'ENVIOS', 'CONFIGURACION'] as const;
export const ACCIONES = ['CREAR', 'MODIFICAR', 'ACTIVAR', 'DESACTIVAR', 'CAMBIAR_ESTADO'] as const;

const filtros = {
    modulo: z.enum(MODULOS).optional(),
    accion: z.enum(ACCIONES).optional(),
    idUsuario: z.coerce.number().int().positive().optional().openapi({ description: 'Quién hizo el cambio.' }),
    entidad: z.string().trim().max(50).optional().openapi({ example: 'Producto' }),
    idEntidad: z
        .string()
        .trim()
        .max(50)
        .optional()
        .openapi({ description: 'ID del registro; requiere la entidad.', example: '12' }),
    fechaDesde: esquemaDia.optional().openapi({ description: 'Día de Guatemala (incluido).' }),
    fechaHasta: esquemaDia.optional().openapi({ description: 'Día de Guatemala (incluido).' }),
};

export const esquemaListarBitacora = esquemaPaginacion.extend(filtros);

/** Exportación (D81): solo Excel, con los mismos filtros. */
export const esquemaExportarBitacora = z.object({ ...filtros, formato: z.enum(['xlsx']).default('xlsx') });

export type FiltrosBitacora = Omit<z.infer<typeof esquemaListarBitacora>, 'pagina' | 'tamanoPagina'>;

export const esquemaRegistroBitacora = z
    .object({
        idBitacora: z.number(),
        fecha: z.string(),
        idUsuario: z.number(),
        usuario: z.string(),
        correo: z.string(),
        codigoRol: z.string(),
        modulo: z.enum(MODULOS),
        entidad: z.string(),
        idEntidad: z.string(),
        accion: z.enum(ACCIONES),
        valorAnterior: z
            .record(z.string(), z.unknown())
            .nullable()
            .openapi({ description: 'Valores antes del cambio.' }),
        valorNuevo: z
            .record(z.string(), z.unknown())
            .nullable()
            .openapi({ description: 'Valores después del cambio.' }),
    })
    .openapi('RegistroBitacora');
