import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../../utils/formularios';
import { esquemaContrasenaNueva, esquemaTelefono } from '../../../cuenta/esquemas';
import { CLAVE_USUARIOS } from './useUsuariosPanel';

const nombre = (mensaje: string) => z.string().trim().min(1, mensaje).max(100, 'Máximo 100 caracteres.');

/** Las reglas de FU_Usuarios_ValidarDatos y de la API, para avisar antes de enviar. */
const esquema = z.object({
    nombre: nombre('Escribe el nombre.'),
    apellido: nombre('Escribe el apellido.'),
    correo: z.email('Escribe un correo válido.'),
    telefono: esquemaTelefono,
    contrasena: esquemaContrasenaNueva,
    rol: z.enum(['OPERADOR', 'ADMIN']),
});
type Datos = z.infer<typeof esquema>;

/** Solo personal del panel: los clientes se registran solos. */
export const ROLES_INTERNOS = [
    { valor: 'OPERADOR', etiqueta: 'Operador', alcance: 'Pedidos, devoluciones e inventario.' },
    {
        valor: 'ADMIN',
        etiqueta: 'Administrador',
        alcance: 'Todo lo anterior, más dashboard, catálogo, cupones, envíos, usuarios, parámetros y bitácora.',
    },
] as const;

export function useCrearUsuario(alTerminar: () => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<Datos>({
        resolver: zodResolver(esquema),
        defaultValues: { nombre: '', apellido: '', correo: '', telefono: '', contrasena: '', rol: 'OPERADOR' },
    });

    const crear = useMutation({
        mutationFn: ({ telefono, ...datos }: Datos) =>
            api.post('/usuarios', { cuerpo: { ...datos, ...(telefono && { telefono }) } }),
        onSuccess: async ({ data }) => {
            avisar({
                tipo: 'exito',
                titulo: `${data.nombre} ${data.apellido} creado`,
                detalle: `Ya puede ingresar como ${data.nombreRol.toLowerCase()} con la contraseña inicial.`,
            });
            await consultas.invalidateQueries({ queryKey: CLAVE_USUARIOS });
            alTerminar();
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    ['nombre', 'apellido', 'correo', 'telefono', 'contrasena'],
                    'No pudimos crear el usuario; intenta de nuevo.',
                    '',
                    {
                        CORREO_REGISTRADO: 'correo',
                        CORREO_INVALIDO: 'correo',
                        NOMBRE_INVALIDO: 'nombre',
                        TELEFONO_INVALIDO: 'telefono',
                    },
                ),
            );
        },
    });

    return {
        formulario,
        errorGeneral,
        creando: crear.isPending,
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            crear.mutate(datos);
        }),
    };
}
