import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { useParametrosTabla } from '../../../../ui/useParametrosTabla';
import { textoRango } from '../../../../utils/calendario';
import { leerDia } from '../../../../utils/formato';
import { etiquetaEntidad } from '../detalleCambio';

export type RegistroBitacora = DatosDe<'get', '/bitacora'>[number];
type Modulo = RegistroBitacora['modulo'];
type Accion = RegistroBitacora['accion'];

const TAMANO_PAGINA = 20;
const COLUMNAS = ['FECHA', 'MODULO', 'ACCION'];
const ORDEN_INICIAL = { ordenarPor: 'FECHA', direccion: 'DESC' } as const;
const FILTROS = ['modulo', 'accion', 'desde', 'hasta', 'usuario', 'entidad', 'registro'] as const;

export const MODULOS: readonly { valor: Modulo; etiqueta: string }[] = [
    { valor: 'PEDIDOS', etiqueta: 'Pedidos' },
    { valor: 'INVENTARIO', etiqueta: 'Inventario' },
    { valor: 'CATALOGO', etiqueta: 'Catálogo' },
    { valor: 'CUPONES', etiqueta: 'Cupones' },
    { valor: 'ENVIOS', etiqueta: 'Envíos' },
    { valor: 'USUARIOS', etiqueta: 'Usuarios' },
    { valor: 'CONFIGURACION', etiqueta: 'Parámetros' },
];

export const ACCIONES: readonly { valor: Accion; etiqueta: string }[] = [
    { valor: 'CREAR', etiqueta: 'Creación' },
    { valor: 'MODIFICAR', etiqueta: 'Edición' },
    { valor: 'ACTIVAR', etiqueta: 'Activación' },
    { valor: 'DESACTIVAR', etiqueta: 'Desactivación' },
    { valor: 'CAMBIAR_ESTADO', etiqueta: 'Cambio de estado' },
];

export const OPCIONES_MODULO = [{ valor: '', etiqueta: 'Todos los módulos' }, ...MODULOS];
export const OPCIONES_ACCION = [{ valor: '', etiqueta: 'Todas las acciones' }, ...ACCIONES];

export const ORDENES_MOVIL = [
    { etiqueta: 'Más recientes', ordenarPor: 'FECHA', direccion: 'DESC' },
    { etiqueta: 'Más antiguos', ordenarPor: 'FECHA', direccion: 'ASC' },
    { etiqueta: 'Por módulo', ordenarPor: 'MODULO', direccion: 'ASC' },
    { etiqueta: 'Por acción', ordenarPor: 'ACCION', direccion: 'ASC' },
] as const;

export const etiquetaModulo = (m: Modulo) => MODULOS.find((x) => x.valor === m)?.etiqueta ?? m;
export const etiquetaAccion = (a: Accion) => ACCIONES.find((x) => x.valor === a)?.etiqueta ?? a;

/** Días de Guatemala, ambos incluidos, como los recibe la API; al revés se ordenan. */
function diasParaApi(desde: string | null, hasta: string | null) {
    const [primero, ultimo] = desde && hasta && desde > hasta ? [hasta, desde] : [desde, hasta];
    return { ...(primero && { fechaDesde: primero }), ...(ultimo && { fechaHasta: ultimo }) };
}

export function useBitacora() {
    const { pagina, orden, filtros, irAPagina, ordenar, fijarOrden, filtrar, filtrarVarios, limpiarFiltros } =
        useParametrosTabla({ columnas: COLUMNAS, ordenPorDefecto: ORDEN_INICIAL, filtros: FILTROS });
    const modulo = MODULOS.find((m) => m.valor === filtros.modulo)?.valor;
    const accion = ACCIONES.find((a) => a.valor === filtros.accion)?.valor;
    const desde = leerDia(filtros.desde);
    const hasta = leerDia(filtros.hasta);
    const leido = Number(filtros.usuario);
    const idUsuario = Number.isSafeInteger(leido) && leido > 0 ? leido : undefined;
    const entidad = /^[A-Za-z]{1,50}$/.test(filtros.entidad) ? filtros.entidad : undefined;
    // El ID de un registro solo filtra junto con su entidad (PARAMETRO_REQUERIDO).
    const idEntidad = entidad && filtros.registro ? filtros.registro.slice(0, 50) : undefined;

    /* Los filtros de la lista, sin paginación: el Excel usa exactamente los mismos. */
    const filtrosApi = {
        ordenarPor: orden.ordenarPor as (typeof ORDEN_INICIAL)['ordenarPor'],
        direccion: orden.direccion,
        ...(modulo && { modulo }),
        ...(accion && { accion }),
        ...(idUsuario && { idUsuario }),
        ...(entidad && { entidad }),
        ...(idEntidad && { idEntidad }),
        ...diasParaApi(desde, hasta),
    };

    const consulta = useQuery({
        queryKey: ['panel', 'bitacora', { pagina, ...filtrosApi }],
        queryFn: ({ signal }) =>
            api.get('/bitacora', { query: { pagina, tamanoPagina: TAMANO_PAGINA, ...filtrosApi }, signal }),
        placeholderData: keepPreviousData,
    });
    const filas = consulta.data?.data;

    return {
        consulta,
        filtrosApi,
        pagina,
        tamanoPagina: TAMANO_PAGINA,
        orden,
        modulo: modulo ?? '',
        accion: accion ?? '',
        desde,
        hasta,
        rango: textoRango(desde, hasta),
        /* El nombre del autor y del registro salen de las filas: todas son suyas. */
        autorFiltrado: idUsuario ? (filas?.[0]?.usuario ?? 'Usuario elegido') : null,
        registroFiltrado: entidad ? `${etiquetaEntidad(entidad)}${idEntidad ? ` #${idEntidad}` : ''}` : null,
        hayFiltros: [modulo, accion, desde, hasta, idUsuario, entidad].some(Boolean),
        irAPagina,
        ordenar,
        fijarOrden,
        filtrar,
        limpiarFiltros,
        elegirFechas: (primero: string, ultimo: string) => {
            filtrarVarios({ desde: primero, hasta: ultimo });
        },
        quitarFechas: () => {
            filtrarVarios({ desde: '', hasta: '' });
        },
        verAutor: (r: RegistroBitacora) => {
            filtrar('usuario', String(r.idUsuario));
        },
        quitarAutor: () => {
            filtrar('usuario', '');
        },
        verRegistro: (r: RegistroBitacora) => {
            filtrarVarios({ entidad: r.entidad, registro: r.idEntidad });
        },
        quitarRegistro: () => {
            filtrarVarios({ entidad: '', registro: '' });
        },
    };
}
