import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { esErrorApi } from '../../../../api/errores';
import { EstadoError, EstadoVacio } from '../../../../ui/Mensajes';
import { Selector } from '../../../../ui/Selector';
import { TablaCompleta } from '../../../../ui/TablaDatos';
import { fechaHora, moneda } from '../../../../utils/formato';
import type { Producto } from './hooks/useEdicionProducto';
import { useHistorialPrecios, type CambioPrecio } from './hooks/useHistorialPrecios';
import { nombreVariante } from './hooks/useVariantesProducto';
import estilos from './productos.module.scss';

const COLUMNAS: ColumnDef<CambioPrecio>[] = [
    {
        header: 'Fecha',
        accessorKey: 'fecha',
        cell: ({ row }) => <span className="numero text-nowrap">{fechaHora(row.original.fecha)}</span>,
    },
    {
        id: 'anterior',
        header: 'Antes',
        meta: { derecha: true },
        cell: ({ row }) =>
            row.original.precioAnterior === null ? 'Precio inicial' : moneda(row.original.precioAnterior),
    },
    {
        id: 'nuevo',
        header: 'Después',
        meta: { derecha: true },
        cell: ({ row }) => <strong>{moneda(row.original.precioNuevo)}</strong>,
    },
    { header: 'Cambió', accessorKey: 'usuario' },
];

export function HistorialProducto({ producto }: { producto: Producto }) {
    const { idVariante, elegir, consulta } = useHistorialPrecios(producto);
    return (
        <TablaCompleta
            etiqueta="Historial de precios"
            columnas={COLUMNAS}
            filas={consulta.data?.data}
            idFila={(c) => String(c.idHistorialPrecio)}
            cargando={consulta.isPending}
            error={
                consulta.isError ? (
                    <EstadoError
                        titulo="No pudimos cargar el historial"
                        mensaje={consulta.error.message}
                        referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                        alReintentar={() => void consulta.refetch()}
                    />
                ) : undefined
            }
            vacio={<EstadoVacio icono={History} titulo="Sin cambios de precio" />}
            unidad="cambios"
            filtros={
                <div className={estilos.selector}>
                    <Selector
                        etiqueta="Variante"
                        compacto
                        valor={idVariante === null ? null : String(idVariante)}
                        opciones={producto.variantes.map((v) => ({
                            valor: String(v.idVariante),
                            etiqueta: `${nombreVariante(v)} · ${v.sku}`,
                        }))}
                        alCambiar={(valor) => {
                            elegir(Number(valor));
                        }}
                    />
                </div>
            }
            tarjeta={(c) => (
                <div className={estilos.tarjetaDatos}>
                    <strong className="numero">
                        {c.precioAnterior === null ? 'Precio inicial' : moneda(c.precioAnterior)} →{' '}
                        {moneda(c.precioNuevo)}
                    </strong>
                    <small className={`${estilos.detalle} numero`}>
                        {fechaHora(c.fecha)} · {c.usuario}
                    </small>
                </div>
            )}
        />
    );
}
