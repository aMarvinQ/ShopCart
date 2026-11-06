import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { useMemo } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Chip } from '../../../ui/Controles';
import { EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { SelectorFechas } from '../../../ui/SelectorFechas';
import { TablaDatos } from '../../../ui/TablaDatos';
import { fechaHora } from '../../../utils/formato';
import { BuscadorVariantes } from './BuscadorVariantes';
import { OPCIONES_TIPO, ORDENES_MOVIL, useKardex, type FilaKardex } from './hooks/useKardex';
import estilos from './inventario.module.scss';

export function Kardex({ alAbrirPedido }: { alAbrirPedido: (id: number) => void }) {
    const lista = useKardex();
    const { consulta } = lista;

    const columnas = useMemo<ColumnDef<FilaKardex>[]>(
        () => [
            {
                header: 'Fecha',
                accessorKey: 'fecha',
                meta: { ordenarPor: 'FECHA' },
                cell: ({ row }) => <span className="numero text-nowrap">{fechaHora(row.original.fecha)}</span>,
            },
            {
                header: 'Producto',
                accessorKey: 'producto',
                meta: { ordenarPor: 'PRODUCTO' },
                cell: ({ row }) => (
                    <>
                        {row.original.producto}
                        <small className={`${estilos.detalle} numero`}>{row.original.sku}</small>
                    </>
                ),
            },
            { header: 'Tipo', accessorKey: 'tipo' },
            {
                header: 'Cantidad',
                accessorKey: 'cantidad',
                meta: { ordenarPor: 'CANTIDAD', derecha: true },
                cell: ({ row }) => <strong>{row.original.cantidad}</strong>,
            },
            {
                id: 'saldo',
                header: 'Saldo',
                meta: { derecha: true },
                cell: ({ row }) => (
                    <span className="text-nowrap">
                        {row.original.saldoAnterior} → {row.original.saldoNuevo}
                    </span>
                ),
            },
            {
                id: 'detalle',
                header: 'Detalle',
                cell: ({ row }) => {
                    const { idPedido, motivo, usuario } = row.original;
                    return (
                        <>
                            {motivo ?? '—'}
                            <small className={estilos.detalle}>{usuario}</small>
                            {idPedido !== null && (
                                <Boton
                                    variante="enlace"
                                    tamano="sm"
                                    onClick={() => {
                                        alAbrirPedido(idPedido);
                                    }}
                                >
                                    Ver pedido
                                </Boton>
                            )}
                        </>
                    );
                },
            },
        ],
        [alAbrirPedido],
    );

    return (
        <TablaDatos
            etiqueta="Kardex"
            columnas={columnas}
            filas={consulta.data?.data}
            idFila={(f) => f.idMovimientoInventario}
            cargando={consulta.isPending}
            actualizando={consulta.isPlaceholderData}
            error={
                consulta.isError ? (
                    <EstadoError
                        titulo="No pudimos cargar el kardex"
                        mensaje={consulta.error.message}
                        referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                        alReintentar={() => void consulta.refetch()}
                    />
                ) : undefined
            }
            vacio={
                <EstadoVacio
                    icono={History}
                    titulo="No hay movimientos con estos filtros"
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
            unidad="movimientos"
            alCambiarPagina={lista.irAPagina}
            tarjeta={(f) => (
                <div className={estilos.tarjeta}>
                    <div className={estilos.tarjetaCabecera}>
                        <div>
                            <strong>{f.producto}</strong>
                            <small className={`${estilos.detalle} numero`}>
                                {f.sku} · {fechaHora(f.fecha)}
                            </small>
                        </div>
                        <strong className="numero">{f.cantidad}</strong>
                    </div>
                    <small className={`${estilos.detalle} numero`}>
                        {f.tipo} · saldo {f.saldoAnterior} → {f.saldoNuevo} · {f.usuario}
                    </small>
                    {f.motivo && <small className={estilos.detalle}>{f.motivo}</small>}
                </div>
            )}
            ordenesMovil={ORDENES_MOVIL}
            alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                lista.fijarOrden(ordenarPor, direccion);
            }}
            filtros={
                <div className={estilos.filtros}>
                    <div className={estilos.buscador}>
                        <BuscadorVariantes
                            alElegir={(fila) => {
                                lista.filtrar('variante', String(fila.idVariante));
                            }}
                        />
                    </div>
                    <div className={estilos.selector}>
                        <Selector
                            etiqueta="Tipo de movimiento"
                            compacto
                            valor={lista.tipo}
                            opciones={OPCIONES_TIPO}
                            alCambiar={(valor) => {
                                lista.filtrar('tipo', valor);
                            }}
                        />
                    </div>
                    <SelectorFechas desde={lista.desde} hasta={lista.hasta} alCambiar={lista.elegirFechas} />
                    {lista.rango && <Chip etiqueta={lista.rango} alQuitar={lista.quitarFechas} />}
                    {lista.filtraVariante && (
                        <Chip
                            etiqueta={lista.skuFiltrado ?? 'Variante elegida'}
                            alQuitar={() => {
                                lista.filtrar('variante', '');
                            }}
                        />
                    )}
                </div>
            }
        />
    );
}
