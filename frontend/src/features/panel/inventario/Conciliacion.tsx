import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { esErrorApi } from '../../../api/errores';
import { Alerta, EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { TablaCompleta } from '../../../ui/TablaDatos';
import { useConciliacion, type FilaConciliacion } from './hooks/useConciliacion';
import estilos from './inventario.module.scss';

const diferencia = (fila: FilaConciliacion) => (
    <span className={`${estilos.diferencia} numero`}>
        <TriangleAlert size={16} aria-hidden="true" />
        {fila.diferencia}
    </span>
);

const COLUMNAS: ColumnDef<FilaConciliacion>[] = [
    {
        header: 'SKU',
        accessorKey: 'sku',
        cell: ({ row }) => <strong className="numero text-nowrap">{row.original.sku}</strong>,
    },
    { header: 'Producto', accessorKey: 'producto' },
    { header: 'Física', accessorKey: 'existenciaFisica', meta: { derecha: true } },
    { header: 'Suma kardex', accessorKey: 'sumaKardex', meta: { derecha: true } },
    {
        header: 'Diferencia',
        accessorKey: 'diferencia',
        meta: { derecha: true },
        cell: ({ row }) => diferencia(row.original),
    },
    { header: 'Movimientos', accessorKey: 'movimientos', meta: { derecha: true } },
    { header: 'Saltos', accessorKey: 'saltos', meta: { derecha: true } },
];

/** Compara cada existencia con su kardex: una diferencia significa que algo se movió sin dejar rastro. */
export function Conciliacion() {
    const consulta = useConciliacion();
    const filas = consulta.data?.data;
    const total = filas?.length ?? 0;

    return (
        <div className={estilos.vista}>
            {total > 0 && (
                <Alerta
                    tipo="aviso"
                    titulo={`${String(total)} ${total === 1 ? 'variante no cuadra' : 'variantes no cuadran'}`}
                >
                    Su existencia no coincide con el kardex o hay saltos de saldo. Revisa sus movimientos.
                </Alerta>
            )}
            {/* La API la entrega completa y sin orden: una sola página, sin encabezados que ordenar. */}
            <TablaCompleta
                etiqueta="Variantes que no cuadran"
                columnas={COLUMNAS}
                filas={filas}
                idFila={(f) => String(f.idVariante)}
                cargando={consulta.isPending}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos revisar el kardex"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={CircleCheck}
                        titulo="Todo cuadra"
                        mensaje="Cada existencia coincide con la suma de sus movimientos en el kardex."
                    />
                }
                unidad={total === 1 ? 'variante' : 'variantes'}
                tarjeta={(f) => (
                    <div className={estilos.tarjeta}>
                        <div className={estilos.tarjetaCabecera}>
                            <div>
                                <strong>{f.producto}</strong>
                                <small className={`${estilos.detalle} numero`}>{f.sku}</small>
                            </div>
                            {diferencia(f)}
                        </div>
                        <small className={`${estilos.detalle} numero`}>
                            Física {f.existenciaFisica} · kardex {f.sumaKardex} · {f.movimientos} movimientos ·{' '}
                            {f.saltos} saltos
                        </small>
                    </div>
                )}
            />
        </div>
    );
}
