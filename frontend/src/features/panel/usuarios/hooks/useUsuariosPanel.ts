import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DatosDe } from '../../../../api/cliente';
import { useSesion } from '../../../../sesion/contexto';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';

export type FilaUsuario = DatosDe<'get', '/usuarios'>[number];

export const CLAVE_USUARIOS = ['panel', 'usuarios'];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['CREACION', 'NOMBRE', 'CORREO', 'ROL', 'ACCESO', 'ESTADO'];
const ORDEN_INICIAL = { ordenarPor: 'NOMBRE', direccion: 'ASC' } as const;
const FILTROS = ['busqueda', 'rol', 'estado'] as const;
const ROLES = ['CLIENTE', 'OPERADOR', 'ADMIN'] as const;
type Rol = (typeof ROLES)[number];

export const OPCIONES_ROL = [
    { valor: '', etiqueta: 'Todos los roles' },
    { valor: 'ADMIN', etiqueta: 'Administradores' },
    { valor: 'OPERADOR', etiqueta: 'Operadores' },
    { valor: 'CLIENTE', etiqueta: 'Clientes' },
];

export const OPCIONES_ESTADO = [
    { valor: '', etiqueta: 'Todos los estados' },
    { valor: 'activos', etiqueta: 'Activos' },
    { valor: 'inactivos', etiqueta: 'Inactivos' },
];

export const ORDENES_MOVIL = [
    { etiqueta: 'Nombre: A a Z', ordenarPor: 'NOMBRE', direccion: 'ASC' },
    { etiqueta: 'Acceso más reciente', ordenarPor: 'ACCESO', direccion: 'DESC' },
    { etiqueta: 'Más recientes', ordenarPor: 'CREACION', direccion: 'DESC' },
    { etiqueta: 'Por rol', ordenarPor: 'ROL', direccion: 'ASC' },
] as const;

export const nombreCompleto = (u: FilaUsuario) => `${u.nombre} ${u.apellido}`;
export const inicialesDe = (u: FilaUsuario) => `${u.nombre.charAt(0)}${u.apellido.charAt(0)}`.toUpperCase();

export function useUsuariosPanel() {
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const { usuario } = useSesion();
    const [porDesactivar, setPorDesactivar] = useState<FilaUsuario | null>(null);
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, limpiarFiltros } = useParametrosTabla({
        columnas: COLUMNAS,
        ordenPorDefecto: ORDEN_INICIAL,
        filtros: FILTROS,
    });
    const busqueda = filtros.busqueda.trim().slice(0, 100);
    const rol = ROLES.find((r): r is Rol => r === filtros.rol);
    const activo = filtros.estado === 'activos' ? true : filtros.estado === 'inactivos' ? false : undefined;

    const consulta = useQuery({
        queryKey: [...CLAVE_USUARIOS, { pagina, orden, busqueda, rol, activo }],
        queryFn: ({ signal }) =>
            api.get('/usuarios', {
                query: {
                    pagina,
                    tamanoPagina: TAMANO_PAGINA,
                    ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
                    direccion: orden.direccion,
                    ...(busqueda && { busqueda }),
                    ...(rol && { rol }),
                    ...(activo !== undefined && { activo: activo ? ('true' as const) : ('false' as const) }),
                },
                signal,
            }),
        placeholderData: keepPreviousData,
        staleTime: 15_000,
    });

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo: nuevo }: { id: number; activo: boolean }) =>
            api.patch('/usuarios/{id}/estado', { params: { id }, cuerpo: { activo: nuevo } }),
        onSuccess: ({ data }) => {
            const sesiones = data.sesionesRevocadas;
            avisar({
                tipo: 'exito',
                titulo: `${data.nombre} ${data.apellido} ${data.activo ? 'activado' : 'desactivado'}`,
                detalle: data.activo
                    ? 'Ya puede ingresar.'
                    : `Ya no puede ingresar. ${String(sesiones)} ${sesiones === 1 ? 'sesión cerrada' : 'sesiones cerradas'}.`,
            });
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo cambiar el estado', detalle: error.message });
        },
        onSettled: async () => {
            setPorDesactivar(null);
            await consultas.invalidateQueries({ queryKey: CLAVE_USUARIOS });
        },
    });

    return {
        consulta,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        busqueda,
        rol: rol ?? '',
        estado: activo === undefined ? '' : filtros.estado,
        hayFiltros: busqueda !== '' || rol !== undefined || activo !== undefined,
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
        /** Un administrador no se desactiva a sí mismo (AUTODESACTIVACION_NO_PERMITIDA). */
        esPropio: (u: FilaUsuario) => u.idUsuario === usuario?.idUsuario,
        porDesactivar,
        cambiando: cambiarEstado.isPending,
        activar: (u: FilaUsuario) => {
            cambiarEstado.mutate({ id: u.idUsuario, activo: true });
        },
        pedirDesactivar: setPorDesactivar,
        desistir: () => {
            setPorDesactivar(null);
        },
        confirmarDesactivar: () => {
            if (porDesactivar) cambiarEstado.mutate({ id: porDesactivar.idUsuario, activo: false });
        },
    };
}
