import type { ColumnDef } from '@tanstack/react-table';
import { Ban, CalendarX, CircleCheck, CirclePause, Clock, Pencil, Plus, TicketPercent } from 'lucide-react';
import { useMemo, useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Interruptor } from '../../../ui/Controles';
import { Cajon, DialogoConfirmacion, EstadoError, EstadoVacio, Insignia } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { BuscadorTabla, TablaDatos } from '../../../ui/TablaDatos';
import { FormularioCupon } from './FormularioCupon';
import {
    OPCIONES_SITUACION,
    ORDENES_MOVIL,
    proporcionUsos,
    textoCondiciones,
    textoDescuento,
    textoVigencia,
    useCuponesPanel,
    type FilaCupon,
} from './hooks/useCuponesPanel';
import estilos from './cupones.module.scss';

const SITUACION = {
    VIGENTE: { tono: 'exito', icono: CircleCheck, texto: 'Vigente' },
    PROGRAMADO: { tono: 'informacion', icono: Clock, texto: 'Programado' },
    VENCIDO: { tono: 'neutro', icono: CalendarX, texto: 'Vencido' },
    AGOTADO: { tono: 'aviso', icono: Ban, texto: 'Agotado' },
    INACTIVO: { tono: 'neutro', icono: CirclePause, texto: 'Desactivado' },
} as const;

function Codigo({ valor }: { valor: string }) {
    return (
        <span className={`badge ${estilos.codigo}`}>
            <TicketPercent size={16} aria-hidden="true" />
            {valor}
        </span>
    );
}

function Situacion({ cupon }: { cupon: FilaCupon }) {
    const { tono, icono, texto } = SITUACION[cupon.situacion];
    return (
        <Insignia tono={tono} icono={icono}>
            {texto}
        </Insignia>
    );
}

function Usos({ cupon }: { cupon: FilaCupon }) {
    return (
        <span className={estilos.usos}>
            <span className="numero">
                {cupon.usosActuales.toLocaleString('en-US')} /{' '}
                {cupon.limiteUsosTotal === null ? 'sin límite' : cupon.limiteUsosTotal.toLocaleString('en-US')}
            </span>
            <span className={estilos.barraUsos} aria-hidden="true">
                <span style={{ width: `${String(proporcionUsos(cupon))}%` }} />
            </span>
        </span>
    );
}

export default function Cupones() {
    const lista = useCuponesPanel();
    const { consulta, cambiando, alternar, pedirDesactivar } = lista;
    /* undefined: cerrado; null: cupón nuevo; número: editando ese cupón. */
    const [edicion, setEdicion] = useState<number | null | undefined>(undefined);

    const interruptor = useMemo(
        () => (cupon: FilaCupon) => (
            <Interruptor
                etiqueta={`Activo: ${cupon.codigo}`}
                etiquetaOculta
                checked={cupon.activo}
                disabled={cambiando}
                onChange={() => {
                    if (cupon.activo) pedirDesactivar(cupon);
                    else alternar({ id: cupon.idCupon, activo: true });
                }}
            />
        ),
        [cambiando, alternar, pedirDesactivar],
    );

    const columnas = useMemo<ColumnDef<FilaCupon>[]>(
        () => [
            {
                header: 'Código',
                accessorKey: 'codigo',
                meta: { ordenarPor: 'CODIGO' },
                cell: ({ row }) => <Codigo valor={row.original.codigo} />,
            },
            {
                id: 'descuento',
                header: 'Descuento',
                cell: ({ row }) => <strong className="text-nowrap">{textoDescuento(row.original)}</strong>,
            },
            {
                id: 'aplica',
                header: 'Aplica a',
                cell: ({ row }) => (
                    <>
                        {row.original.categoria ?? 'Todo el catálogo'}
                        <small className={`${estilos.detalle} text-nowrap`}>{textoCondiciones(row.original)}</small>
                    </>
                ),
            },
            {
                id: 'usos',
                header: 'Usos',
                meta: { ordenarPor: 'USOS' },
                cell: ({ row }) => <Usos cupon={row.original} />,
            },
            {
                id: 'vigencia',
                header: 'Vigencia',
                meta: { ordenarPor: 'VIGENCIA' },
                cell: ({ row }) => <span className="text-nowrap">{textoVigencia(row.original)}</span>,
            },
            {
                id: 'situacion',
                header: 'Estado',
                cell: ({ row }) => <Situacion cupon={row.original} />,
            },
            {
                id: 'activo',
                header: 'Activo',
                cell: ({ row }) => interruptor(row.original),
            },
            {
                id: 'acciones',
                header: () => <span className="visually-hidden">Acciones</span>,
                meta: { derecha: true },
                cell: ({ row }) => (
                    <Boton
                        variante="fantasma"
                        icono={Pencil}
                        aria-label={`Editar ${row.original.codigo}`}
                        onClick={() => {
                            setEdicion(row.original.idCupon);
                        }}
                    />
                ),
            },
        ],
        [interruptor],
    );

    return (
        <section className={estilos.pagina}>
            <title>Cupones · ShopCart</title>
            <h1 className={estilos.titulo}>Cupones</h1>
            <TablaDatos
                etiqueta="Cupones"
                columnas={columnas}
                filas={consulta.data?.data}
                idFila={(c) => String(c.idCupon)}
                cargando={consulta.isPending}
                actualizando={consulta.isPlaceholderData}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar los cupones"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={TicketPercent}
                        titulo={lista.hayFiltros ? 'No hay cupones con estos filtros' : 'Aún no hay cupones'}
                        accion={
                            lista.hayFiltros ? (
                                <Boton variante="secundario" tamano="sm" onClick={lista.limpiarFiltros}>
                                    Limpiar filtros
                                </Boton>
                            ) : undefined
                        }
                    />
                }
                orden={lista.orden}
                alOrdenar={lista.ordenar}
                pagina={lista.pagina}
                tamanoPagina={lista.tamanoPagina}
                totalRegistros={consulta.data?.meta.totalRegistros ?? 0}
                unidad="cupones"
                alCambiarPagina={lista.irAPagina}
                ordenesMovil={ORDENES_MOVIL}
                alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                    lista.fijarOrden(ordenarPor, direccion);
                }}
                tarjeta={(c) => (
                    <div className={estilos.tarjeta}>
                        <div className={estilos.tarjetaDatos}>
                            <span className={estilos.tarjetaCabecera}>
                                <Codigo valor={c.codigo} />
                                <strong>{textoDescuento(c)}</strong>
                            </span>
                            <small className={estilos.detalle}>
                                {c.categoria ?? 'Todo el catálogo'} · {textoVigencia(c)}
                            </small>
                            <Usos cupon={c} />
                            <Situacion cupon={c} />
                        </div>
                        {interruptor(c)}
                        <Boton
                            variante="fantasma"
                            icono={Pencil}
                            aria-label={`Editar ${c.codigo}`}
                            onClick={() => {
                                setEdicion(c.idCupon);
                            }}
                        />
                    </div>
                )}
                filtros={
                    <div className={estilos.filtros}>
                        <div className={estilos.buscador}>
                            <BuscadorTabla
                                etiqueta="Código o descripción"
                                valor={lista.busqueda}
                                alCambiar={(valor) => {
                                    lista.filtrar('busqueda', valor);
                                }}
                            />
                        </div>
                        <div className={estilos.selector}>
                            <Selector
                                etiqueta="Estado"
                                compacto
                                valor={lista.situacion}
                                opciones={OPCIONES_SITUACION}
                                alCambiar={(valor) => {
                                    lista.filtrar('situacion', valor);
                                }}
                            />
                        </div>
                    </div>
                }
                acciones={
                    <Boton
                        icono={Plus}
                        onClick={() => {
                            setEdicion(null);
                        }}
                    >
                        Nuevo cupón
                    </Boton>
                }
            />
            <p className={estilos.nota}>
                Desactivar un cupón pide confirmación; los pedidos ya pagados conservan su descuento.
            </p>
            <Cajon
                mostrar={edicion !== undefined}
                titulo={edicion === null ? 'Nuevo cupón' : 'Editar cupón'}
                alCerrar={() => {
                    setEdicion(undefined);
                }}
            >
                {edicion !== undefined && (
                    <FormularioCupon
                        key={String(edicion)}
                        id={edicion}
                        alTerminar={() => {
                            setEdicion(undefined);
                        }}
                    />
                )}
            </Cajon>
            <DialogoConfirmacion
                mostrar={lista.porDesactivar !== null}
                titulo={`¿Desactivar ${lista.porDesactivar?.codigo ?? ''}?`}
                textoConfirmar="Sí, desactivar"
                cargando={cambiando}
                alCancelar={lista.desistir}
                alConfirmar={lista.confirmarDesactivar}
            >
                Dejará de aplicarse en la tienda. Los pedidos ya pagados conservan su descuento y puedes reactivarlo
                después.
            </DialogoConfirmacion>
        </section>
    );
}
