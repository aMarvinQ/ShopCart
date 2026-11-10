import type { ColumnDef } from '@tanstack/react-table';
import {
    CircleCheck,
    CirclePause,
    Headset,
    Pencil,
    ShieldCheck,
    User,
    UserCheck,
    UserPlus,
    Users,
    UserX,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Cajon, DialogoConfirmacion, EstadoError, EstadoVacio, Insignia } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { BuscadorTabla, TablaDatos } from '../../../ui/TablaDatos';
import { fechaHora } from '../../../utils/formato';
import { FormularioUsuario } from './FormularioUsuario';
import { esEditable } from './hooks/useFormularioUsuario';
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
                {usuario.telefono && (
                    <small className={`${estilos.detalle} ${estilos.telefono}`}>{usuario.telefono}</small>
                )}
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
    /*
        El panel lateral crea (usuario null) o edita al elegido. Al cerrar se conserva a quién mostraba
        para que el título no cambie mientras se desliza fuera.
    */
    const [panel, setPanel] = useState<{ abierto: boolean; usuario: FilaUsuario | null }>({
        abierto: false,
        usuario: null,
    });
    const cerrarPanel = () => {
        setPanel((actual) => ({ ...actual, abierto: false }));
    };
    const editado = panel.usuario;

    /*
        Tu propia cuenta no lleva acciones: un administrador no se desactiva ni se quita el rol a sí mismo.
        Editar solo aplica a operadores y administradores; el cliente edita su propio perfil.
    */
    const acciones = useMemo(
        () => (u: FilaUsuario) =>
            esPropio(u) ? null : (
                <span className={estilos.acciones}>
                    {esEditable(u) && (
                        <Boton
                            variante="fantasma"
                            icono={Pencil}
                            aria-label={`Editar a ${nombreCompleto(u)}`}
                            title="Editar"
                            onClick={() => {
                                setPanel({ abierto: true, usuario: u });
                            }}
                        />
                    )}
                    {u.activo ? (
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
                    )}
                </span>
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
            {
                id: 'correo',
                header: 'Correo',
                meta: { ordenarPor: 'CORREO' },
                cell: ({ row }) => <span className={estilos.correo}>{row.original.correo}</span>,
            },
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
                cell: ({ row }) => acciones(row.original),
            },
        ],
        [esPropio, acciones],
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
                        {acciones(u)}
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
                            setPanel({ abierto: true, usuario: null });
                        }}
                    >
                        Crear usuario
                    </Boton>
                }
            />
            <Cajon
                mostrar={panel.abierto}
                titulo={editado ? `Editar a ${nombreCompleto(editado)}` : 'Crear usuario del panel'}
                subtitulo={
                    editado ? 'Sus datos de contacto y su rol.' : 'Los clientes se registran solos desde la tienda.'
                }
                alCerrar={cerrarPanel}
            >
                {/* La llave reinicia el formulario al pasar de un usuario a otro. */}
                {panel.abierto && (
                    <FormularioUsuario key={editado?.idUsuario ?? 'nuevo'} usuario={editado} alTerminar={cerrarPanel} />
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
