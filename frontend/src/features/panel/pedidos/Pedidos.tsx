import type { ColumnDef } from '@tanstack/react-table';
import { PackageSearch } from 'lucide-react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Chip } from '../../../ui/Controles';
import { EstadoError, EstadoPedido, EstadoVacio } from '../../../ui/Mensajes';
import { PestanasFiltro } from '../../../ui/Navegacion';
import { Selector } from '../../../ui/Selector';
import { SelectorFechas } from '../../../ui/SelectorFechas';
import { BuscadorTabla, TablaDatos } from '../../../ui/TablaDatos';
import { fechaHora, moneda } from '../../../utils/formato';
import { ORDENES_MOVIL, usePedidosPanel, type FilaPedido } from './hooks/usePedidosPanel';
import estilos from './pedidos.module.scss';

const COLUMNAS: ColumnDef<FilaPedido>[] = [
    {
        header: 'Pedido',
        accessorKey: 'numeroPedido',
        meta: { ordenarPor: 'NUMERO' },
        cell: ({ row }) => <strong className="numero">{row.original.numeroPedido}</strong>,
    },
    {
        header: 'Fecha',
        accessorKey: 'fechaPedido',
        meta: { ordenarPor: 'FECHA' },
        cell: ({ row }) => <span className="numero text-nowrap">{fechaHora(row.original.fechaPedido)}</span>,
    },
    {
        header: 'Cliente',
        accessorKey: 'nombreContacto',
        meta: { ordenarPor: 'CLIENTE' },
        cell: ({ row }) => (
            <>
                {row.original.nombreContacto}
                <small className={estilos.detalleCliente}>
                    {row.original.correoContacto}
                    {row.original.esInvitado && ' · Invitado'}
                </small>
            </>
        ),
    },
    {
        header: 'Estado',
        accessorKey: 'codigoEstado',
        meta: { ordenarPor: 'ESTADO' },
        cell: ({ row }) => <EstadoPedido codigo={row.original.codigoEstado} />,
    },
    {
        header: 'Total',
        accessorKey: 'total',
        meta: { ordenarPor: 'TOTAL', derecha: true },
        cell: ({ row }) => <strong>{moneda(row.original.total)}</strong>,
    },
];

function TarjetaPedido({ pedido }: { pedido: FilaPedido }) {
    return (
        <div className={estilos.tarjetaPedido}>
            <strong className="numero">{pedido.numeroPedido}</strong>
            <strong className="numero text-end">{moneda(pedido.total)}</strong>
            <small>
                {pedido.nombreContacto}
                <br />
                <span className="numero">{fechaHora(pedido.fechaPedido)}</span>
            </small>
            <EstadoPedido codigo={pedido.codigoEstado} />
        </div>
    );
}

export default function Pedidos() {
    const lista = usePedidosPanel();
    const { consulta } = lista;

    return (
        <section className={estilos.pagina}>
            <title>Pedidos · ShopCart</title>
            <h1 className={estilos.titulo}>Pedidos</h1>
            <div className="d-none d-lg-block">
                <PestanasFiltro
                    etiqueta="Filtrar por estado"
                    opciones={lista.estados}
                    valor={lista.estado}
                    alCambiar={lista.elegirEstado}
                />
            </div>
            <TablaDatos
                etiqueta="Pedidos"
                columnas={COLUMNAS}
                filas={consulta.data?.data}
                idFila={(p) => String(p.idPedido)}
                cargando={consulta.isPending}
                actualizando={consulta.isPlaceholderData}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar los pedidos"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={PackageSearch}
                        titulo="No hay pedidos con estos filtros"
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
                unidad="pedidos"
                alCambiarPagina={lista.irAPagina}
                tarjeta={(p) => <TarjetaPedido pedido={p} />}
                ordenesMovil={ORDENES_MOVIL}
                alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                    lista.fijarOrden(ordenarPor, direccion);
                }}
                filtros={
                    <div className={estilos.filtros}>
                        <div className={estilos.buscador}>
                            <BuscadorTabla
                                etiqueta="N.º de pedido o cliente"
                                valor={lista.busqueda}
                                alCambiar={(valor) => {
                                    lista.filtrar('busqueda', valor);
                                }}
                            />
                        </div>
                        <div className={`d-lg-none ${estilos.estadoMovil}`}>
                            <Selector
                                etiqueta="Estado"
                                compacto
                                valor={lista.estado}
                                opciones={lista.estados.map((e) => ({
                                    valor: e.valor,
                                    etiqueta: e.conteo === null ? e.etiqueta : `${e.etiqueta} (${String(e.conteo)})`,
                                }))}
                                alCambiar={lista.elegirEstado}
                            />
                        </div>
                        <SelectorFechas desde={lista.desde} hasta={lista.hasta} alCambiar={lista.elegirFechas} />
                        {lista.rango && <Chip etiqueta={lista.rango} alQuitar={lista.quitarFechas} />}
                    </div>
                }
            />
        </section>
    );
}
