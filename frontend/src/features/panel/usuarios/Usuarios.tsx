import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, CirclePause, Headset, ShieldCheck, User, UserCheck, UserPlus, Users, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Cajon, DialogoConfirmacion, EstadoError, EstadoVacio, Insignia } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { BuscadorTabla, TablaDatos } from '../../../ui/TablaDatos';
import { fechaHora } from '../../../utils/formato';
import { FormularioUsuario } from './FormularioUsuario';
import {
    inicialesDe,
    nombreCompleto,
    OPCIONES_ESTADO,
    OPCIONES_ROL,
    ORDENES_MOVIL,
    useUsuariosPanel,
    type FilaUsuario,
} from './hooks/useUsuariosPanel';
import estilos from './usuarios.module.scss';

function Persona({ usuario, propio }: { usuario: FilaUsuario; propio: boolean }) {
    return (
        <span className={estilos.persona}>
            <span className={estilos.avatar} aria-hidden="true">
                {inicialesDe(usuario)}
            </span>
            <span className={estilos.personaDatos}>
                <strong>
                    {nombreCompleto(usuario)}
                    {propio && ' (tú)'}
                </strong>
                {usuario.telefono && <small className={estilos.detalle}>{usuario.telefono}</small>}
            </span>
        </span>
    );
}

const iconoRol = (codigo: string) => (codigo === 'ADMIN' ? ShieldCheck : codigo === 'OPERADOR' ? Headset : User);

const Rol = ({ usuario }: { usuario: FilaUsuario }) => (
    <Insignia tono={usuario.codigoRol === 'ADMIN' ? 'informacion' : 'neutro'} icono={iconoRol(usuario.codigoRol)}>
        {usuario.nombreRol}
    </Insignia>
);

const Estado = ({ usuario }: { usuario: FilaUsuario }) =>
    usuario.activo ? (
        <Insignia tono="exito" icono={CircleCheck}>
            Activo
        </Insignia>
    ) : (
        <Insignia tono="neutro" icono={CirclePause}>
            Inactivo
        </Insignia>
    );

const ultimoAcceso = (u: FilaUsuario) => (u.ultimoAcceso ? fechaHora(u.ultimoAcceso) : 'Nunca');

export default function Usuarios() {
    const lista = useUsuariosPanel();
    const { consulta, cambiando, esPropio, activar, pedirDesactivar } = lista;
    const [creando, setCreando] = useState(false);

    /* Tu propia cuenta no lleva acción: un administrador no se desactiva a sí mismo. */
    const accion = useMemo(
        () => (u: FilaUsuario) =>
            esPropio(u) ? null : u.activo ? (
                <Boton
                    variante="fantasma"
                    icono={UserX}
                    aria-label={`Desactivar a ${nombreCompleto(u)}`}
                    title="Desactivar"
                    disabled={cambiando}
                    onClick={() => {
                        pedirDesactivar(u);
                    }}
                />
            ) : (
                <Boton
                    variante="fantasma"
                    icono={UserCheck}
                    aria-label={`Activar a ${nombreCompleto(u)}`}
                    title="Activar"
                    disabled={cambiando}
                    onClick={() => {
                        activar(u);
                    }}
                />
            ),
        [esPropio, cambiando, activar, pedirDesactivar],
    );

    const columnas = useMemo<ColumnDef<FilaUsuario>[]>(
        () => [
            {
                id: 'nombre',
                header: 'Nombre',
                meta: { ordenarPor: 'NOMBRE' },
                cell: ({ row }) => <Persona usuario={row.original} propio={esPropio(row.original)} />,
            },
            { header: 'Correo', accessorKey: 'correo', meta: { ordenarPor: 'CORREO' } },
            {
                id: 'rol',
                header: 'Rol',
                meta: { ordenarPor: 'ROL' },
                cell: ({ row }) => <Rol usuario={row.original} />,
            },
            {
                id: 'estado',
                header: 'Estado',
                meta: { ordenarPor: 'ESTADO' },
                cell: ({ row }) => <Estado usuario={row.original} />,
            },
            {
                id: 'acceso',
                header: 'Último acceso',
                meta: { ordenarPor: 'ACCESO' },
                cell: ({ row }) => <span className="text-nowrap">{ultimoAcceso(row.original)}</span>,
            },
            {
                id: 'acciones',
                header: () => <span className="visually-hidden">Acciones</span>,
                meta: { derecha: true },
                cell: ({ row }) => accion(row.original),
            },
        ],
        [esPropio, accion],
    );

    return (
        <section className={estilos.pagina}>
            <title>Usuarios · ShopCart</title>
            <h1 className={estilos.titulo}>Usuarios</h1>
            <TablaDatos
                etiqueta="Usuarios"
                columnas={columnas}
                filas={consulta.data?.data}
                idFila={(u) => String(u.idUsuario)}
                cargando={consulta.isPending}
                actualizando={consulta.isPlaceholderData}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar los usuarios"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={Users}
                        titulo={
                            lista.busqueda
                                ? `Ningún usuario coincide con “${lista.busqueda}”`
                                : 'No hay usuarios con estos filtros'
                        }
                        mensaje="Revisa el nombre o el correo, o quita los filtros."
                        accion={
                            <Boton variante="secundario" tamano="sm" onClick={lista.limpiarFiltros}>
                                Limpiar filtros
                            </Boton>
                        }
                    />
                }
                orden={lista.orden}
                alOrdenar={lista.ordenar}
                pagina={lista.pagina}
                tamanoPagina={lista.tamanoPagina}
                totalRegistros={consulta.data?.meta.totalRegistros ?? 0}
                unidad="usuarios"
                alCambiarPagina={lista.irAPagina}
                ordenesMovil={ORDENES_MOVIL}
                alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                    lista.fijarOrden(ordenarPor, direccion);
                }}
                tarjeta={(u) => (
                    <div className={estilos.tarjeta}>
                        <div className={estilos.tarjetaDatos}>
                            <Persona usuario={u} propio={esPropio(u)} />
                            <small className={estilos.detalle}>{u.correo}</small>
                            <span className={estilos.insignias}>
                                <Rol usuario={u} />
                                <Estado usuario={u} />
                            </span>
                            <small className={estilos.detalle}>Último acceso: {ultimoAcceso(u)}</small>
                        </div>
                        {accion(u)}
                    </div>
                )}
                filtros={
                    <div className={estilos.filtros}>
                        <div className={estilos.buscador}>
                            <BuscadorTabla
                                etiqueta="Nombre o correo"
                                valor={lista.busqueda}
                                alCambiar={(valor) => {
                                    lista.filtrar('busqueda', valor);
                                }}
                            />
                        </div>
                        <div className={estilos.selector}>
                            <Selector
                                etiqueta="Rol"
                                compacto
                                valor={lista.rol}
                                opciones={OPCIONES_ROL}
                                alCambiar={(valor) => {
                                    lista.filtrar('rol', valor);
                                }}
                            />
                        </div>
                        <div className={estilos.selector}>
                            <Selector
                                etiqueta="Estado"
                                compacto
                                valor={lista.estado}
                                opciones={OPCIONES_ESTADO}
                                alCambiar={(valor) => {
                                    lista.filtrar('estado', valor);
                                }}
                            />
                        </div>
                    </div>
                }
                acciones={
                    <Boton
                        icono={UserPlus}
                        onClick={() => {
                            setCreando(true);
                        }}
                    >
                        Crear usuario
                    </Boton>
                }
            />
            <Cajon
                mostrar={creando}
                titulo="Crear usuario del panel"
                subtitulo="Los clientes se registran solos desde la tienda."
                alCerrar={() => {
                    setCreando(false);
                }}
            >
                {creando && (
                    <FormularioUsuario
                        alTerminar={() => {
                            setCreando(false);
                        }}
                    />
                )}
            </Cajon>
            <DialogoConfirmacion
                mostrar={lista.porDesactivar !== null}
                titulo={`¿Desactivar a ${lista.porDesactivar ? nombreCompleto(lista.porDesactivar) : ''}?`}
                textoConfirmar="Sí, desactivar"
                cargando={cambiando}
                alCancelar={lista.desistir}
                alConfirmar={lista.confirmarDesactivar}
            >
                <strong>Cerrará todas sus sesiones.</strong> Ya no podrá ingresar; su historial se conserva y puedes
                reactivarlo después.
            </DialogoConfirmacion>
        </section>
    );
}
