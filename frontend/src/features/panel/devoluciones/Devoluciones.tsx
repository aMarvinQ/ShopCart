import type { ColumnDef } from '@tanstack/react-table';
import { Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton, BotonEnlace } from '../../../ui/Boton';
import { Chip } from '../../../ui/Controles';
import { EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { SelectorFechas } from '../../../ui/SelectorFechas';
import { TablaDatos } from '../../../ui/TablaDatos';
import { fechaHora, moneda } from '../../../utils/formato';
import { DetallePedidoPanel } from '../pedidos/DetallePedidoPanel';
import { usePedidoAbierto } from '../pedidos/hooks/useGestionPedido';
import { ORDENES_MOVIL, useDevoluciones, type FilaDevolucion } from './hooks/useDevoluciones';
import estilos from './devoluciones.module.scss';

function crearColumnas(abrir: (id: number) => void): ColumnDef<FilaDevolucion>[] {
    return [
        {
            header: 'Pedido',
            accessorKey: 'numeroPedido',
            meta: { ordenarPor: 'PEDIDO' },
            cell: ({ row }) => (
                <Boton
                    variante="enlace"
                    tamano="sm"
                    onClick={() => {
                        abrir(row.original.idPedido);
                    }}
                >
                    <span className="numero">{row.original.numeroPedido}</span>
                </Boton>
            ),
        },
        {
            header: 'Fecha',
            accessorKey: 'fecha',
            meta: { ordenarPor: 'FECHA' },
            cell: ({ row }) => <span className="numero text-nowrap">{fechaHora(row.original.fecha)}</span>,
        },
        { header: 'Motivo', accessorKey: 'motivo' },
        { header: 'Registró', accessorKey: 'usuario' },
        { header: 'Unidades', accessorKey: 'unidades', meta: { derecha: true } },
        {
            header: 'Reembolso',
            accessorKey: 'montoReembolso',
            meta: { ordenarPor: 'MONTO', derecha: true },
            cell: ({ row }) => <strong>{moneda(row.original.montoReembolso)}</strong>,
        },
    ];
}

function TarjetaDevolucion({ devolucion, alAbrir }: { devolucion: FilaDevolucion; alAbrir: () => void }) {
    return (
        <button type="button" className={estilos.tarjeta} onClick={alAbrir}>
            <strong className="numero">{devolucion.numeroPedido}</strong>
            <strong className="numero text-end">{moneda(devolucion.montoReembolso)}</strong>
            <small className={estilos.tarjetaMotivo}>{devolucion.motivo}</small>
            <small className="numero">
                {fechaHora(devolucion.fecha)} · {devolucion.unidades} u
            </small>
        </button>
    );
}

export default function Devoluciones() {
    const lista = useDevoluciones();
    const { consulta } = lista;
    const { idAbierto, abrir, cerrar } = usePedidoAbierto();
    const columnas = useMemo(() => crearColumnas(abrir), [abrir]);

    return (
        <section className={estilos.pagina}>
            <title>Devoluciones · ShopCart</title>
            <h1 className={estilos.titulo}>Devoluciones</h1>
            <TablaDatos
                etiqueta="Devoluciones"
                columnas={columnas}
                filas={consulta.data?.data}
                idFila={(d) => String(d.idDevolucion)}
                cargando={consulta.isPending}
                actualizando={consulta.isPlaceholderData}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar las devoluciones"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={Undo2}
                        titulo={lista.hayFiltros ? 'Sin devoluciones en estas fechas' : 'Sin devoluciones'}
                        mensaje={lista.hayFiltros ? undefined : 'Se registran desde el detalle de un pedido entregado.'}
                        accion={
                            lista.hayFiltros ? (
                                <Boton variante="secundario" tamano="sm" onClick={lista.limpiarFiltros}>
                                    Limpiar filtros
                                </Boton>
                            ) : (
                                <BotonEnlace to="/panel/pedidos" tamano="sm">
                                    Ir a pedidos
                                </BotonEnlace>
                            )
                        }
                    />
                }
                orden={lista.orden}
                alOrdenar={lista.ordenar}
                pagina={lista.pagina}
                tamanoPagina={lista.tamanoPagina}
                totalRegistros={consulta.data?.meta.totalRegistros ?? 0}
                unidad="devoluciones"
                alCambiarPagina={lista.irAPagina}
                tarjeta={(d) => (
                    <TarjetaDevolucion
                        devolucion={d}
                        alAbrir={() => {
                            abrir(d.idPedido);
                        }}
                    />
                )}
                ordenesMovil={ORDENES_MOVIL}
                alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                    lista.fijarOrden(ordenarPor, direccion);
                }}
                filtros={
                    <div className={estilos.filtros}>
                        <SelectorFechas desde={lista.desde} hasta={lista.hasta} alCambiar={lista.elegirFechas} />
                        {lista.rango && <Chip etiqueta={lista.rango} alQuitar={lista.quitarFechas} />}
                    </div>
                }
            />
            <DetallePedidoPanel id={idAbierto} alCerrar={cerrar} />
        </section>
    );
}
