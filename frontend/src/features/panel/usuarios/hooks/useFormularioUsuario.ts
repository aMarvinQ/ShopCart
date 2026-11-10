import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '../../../../api/cliente';
import { esErrorApi } from '../../../../api/errores';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { aplicarErroresApi } from '../../../../utils/formularios';
import { esquemaContrasenaNueva, esquemaTelefono } from '../../../cuenta/esquemas';
import { CLAVE_USUARIOS, type FilaUsuario } from './useUsuariosPanel';

const nombre = (mensaje: string) => z.string().trim().min(1, mensaje).max(100, 'Máximo 100 caracteres.');

/** Las reglas de FU_Usuarios_ValidarDatos y de la API, para avisar antes de enviar. */
const esquemaAlta = z.object({
    nombre: nombre('Escribe el nombre.'),
    apellido: nombre('Escribe el apellido.'),
    correo: z.email('Escribe un correo válido.'),
    telefono: esquemaTelefono,
    contrasena: esquemaContrasenaNueva,
    rol: z.enum(['OPERADOR', 'ADMIN']),
});
type Datos = z.infer<typeof esquemaAlta>;

/* Al editar, el correo se muestra pero no se envía (identifica la cuenta) y la contraseña no se toca. */
const esquemaEdicion = esquemaAlta.extend({ correo: z.string(), contrasena: z.string() });

/** Solo personal del panel: los clientes se registran solos. */
export const ROLES_INTERNOS = [
    { valor: 'OPERADOR', etiqueta: 'Operador', alcance: 'Pedidos, devoluciones e inventario.' },
    {
        valor: 'ADMIN',
        etiqueta: 'Administrador',
        alcance: 'Todo lo anterior, más dashboard, catálogo, cupones, envíos, usuarios, parámetros y bitácora.',
    },
] as const;

/** Desde el panel se editan operadores y administradores; el cliente edita su propio perfil. */
export const esEditable = (u: FilaUsuario) => u.codigoRol === 'OPERADOR' || u.codigoRol === 'ADMIN';

const ERRORES_POR_CAMPO = {
    CORREO_REGISTRADO: 'correo',
    CORREO_INVALIDO: 'correo',
    NOMBRE_INVALIDO: 'nombre',
    TELEFONO_INVALIDO: 'telefono',
} as const;

const sesionesCerradas = (n: number) => `${String(n)} ${n === 1 ? 'sesión cerrada' : 'sesiones cerradas'}`;

/** Alta de un usuario del panel o, con `usuario`, edición de sus datos y su rol. */
export function useFormularioUsuario(usuario: FilaUsuario | null, alTerminar: () => void) {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<Datos>({
        resolver: zodResolver(usuario ? esquemaEdicion : esquemaAlta),
        defaultValues: usuario
            ? {
                  nombre: usuario.nombre,
                  apellido: usuario.apellido,
                  correo: usuario.correo,
                  telefono: usuario.telefono ?? '',
                  contrasena: '',
                  rol: usuario.codigoRol === 'ADMIN' ? 'ADMIN' : 'OPERADOR',
              }
            : { nombre: '', apellido: '', correo: '', telefono: '', contrasena: '', rol: 'OPERADOR' },
    });

    const alFallar = (error: Error, mensaje: string) => {
        if (esErrorApi(error) && error.codigo === 'EDICION_CONCURRENTE') {
            // Se recarga la lista: al volver a abrirlo se ve lo último.
            void consultas.invalidateQueries({ queryKey: CLAVE_USUARIOS });
            setErrorGeneral(
                'Alguien más modificó a este usuario. Cierra el panel y vuelve a abrirlo para ver lo último.',
            );
            return;
        }
        setErrorGeneral(
            aplicarErroresApi(
                error,
                formulario.setError,
                ['nombre', 'apellido', 'correo', 'telefono', 'contrasena'],
                mensaje,
                '',
                ERRORES_POR_CAMPO,
            ),
        );
    };

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
            alFallar(error, 'No pudimos crear el usuario; intenta de nuevo.');
        },
    });

    const editar = useMutation({
        mutationFn: ({ id, fechaModificacion, datos }: { id: number; fechaModificacion: string; datos: Datos }) =>
            api.put('/usuarios/{id}', {
                params: { id },
                cuerpo: {
                    nombre: datos.nombre,
                    apellido: datos.apellido,
                    telefono: datos.telefono || null,
                    rol: datos.rol,
                    fechaModificacion,
                },
            }),
        onSuccess: async ({ data }) => {
            avisar({
                tipo: 'exito',
                titulo: `${data.nombre} ${data.apellido} actualizado`,
                ...(data.sesionesRevocadas > 0 && {
                    detalle: `Ahora es ${data.nombreRol.toLowerCase()}: ${sesionesCerradas(data.sesionesRevocadas)}.`,
                }),
            });
            await consultas.invalidateQueries({ queryKey: CLAVE_USUARIOS });
            alTerminar();
        },
        onError: (error) => {
            alFallar(error, 'No pudimos guardar los cambios; intenta de nuevo.');
        },
    });

    return {
        formulario,
        editando: usuario !== null,
        errorGeneral,
        guardando: crear.isPending || editar.isPending,
        enviar: formulario.handleSubmit((datos) => {
            setErrorGeneral(null);
            if (usuario) editar.mutate({ id: usuario.idUsuario, fechaModificacion: usuario.fechaModificacion, datos });
            else crear.mutate(datos);
        }),
    };
}
