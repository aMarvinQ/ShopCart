import type { ColumnDef } from '@tanstack/react-table';
import { CircleCheck, CircleSlash, CircleX, PackageSearch, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { EstadoError, EstadoVacio, Insignia } from '../../../ui/Mensajes';
import { Selector } from '../../../ui/Selector';
import { BuscadorTabla, MenuAcciones, TablaDatos } from '../../../ui/TablaDatos';
import {
    ESTADOS_EXISTENCIA,
    ORDENES_MOVIL,
    estadoDeExistencia,
    useExistencias,
    type EstadoExistencia,
    type FilaExistencia,
} from './hooks/useExistencias';
import estilos from './inventario.module.scss';

const INSIGNIAS: Record<
    EstadoExistencia,
    { tono: 'exito' | 'aviso' | 'peligro' | 'neutro'; icono: LucideIcon; texto: string }
> = {
    agotado: { tono: 'peligro', icono: CircleX, texto: 'Agotado' },
    bajo: { tono: 'aviso', icono: TriangleAlert, texto: 'Bajo' },
    disponible: { tono: 'exito', icono: CircleCheck, texto: 'Disponible' },
    'fuera-de-venta': { tono: 'neutro', icono: CircleSlash, texto: 'Fuera de venta' },
};

function InsigniaExistencia({ estado }: { estado: EstadoExistencia }) {
    const { tono, icono, texto } = INSIGNIAS[estado];
    return (
        <Insignia tono={tono} icono={icono}>
            {texto}
        </Insignia>
    );
}

export function Existencias({
    alVerKardex,
    alRegistrar,
}: {
    alVerKardex: (idVariante: number) => void;
    alRegistrar: (fila: FilaExistencia) => void;
}) {
    const lista = useExistencias();
    const { consulta, limiteBajo } = lista;

    const columnas = useMemo<ColumnDef<FilaExistencia>[]>(
        () => [
            {
                header: 'SKU',
                accessorKey: 'sku',
                meta: { ordenarPor: 'SKU' },
                cell: ({ row }) => <strong className="numero text-nowrap">{row.original.sku}</strong>,
            },
            {
                header: 'Producto',
                accessorKey: 'producto',
                meta: { ordenarPor: 'PRODUCTO' },
                cell: ({ row }) => (
                    <>
                        {row.original.producto}
                        {row.original.descripcion && (
                            <small className={estilos.detalle}>{row.original.descripcion}</small>
                        )}
                    </>
                ),
            },
            { header: 'Categoría', accessorKey: 'categoria', meta: { ordenarPor: 'CATEGORIA' } },
            { header: 'Física', accessorKey: 'existenciaFisica', meta: { ordenarPor: 'FISICA', derecha: true } },
            { header: 'Reservado', accessorKey: 'reservado', meta: { ordenarPor: 'RESERVADO', derecha: true } },
            {
                header: 'Disponible',
                accessorKey: 'disponible',
                meta: { ordenarPor: 'DISPONIBLE', derecha: true },
                cell: ({ row }) => <strong>{row.original.disponible}</strong>,
            },
            {
                id: 'estado',
                header: 'Estado',
                cell: ({ row }) => <InsigniaExistencia estado={estadoDeExistencia(row.original, limiteBajo)} />,
            },
            {
                id: 'acciones',
                header: () => <span className="visually-hidden">Acciones</span>,
                meta: { derecha: true },
                cell: ({ row }) => (
                    <MenuAcciones
                        etiqueta={`Acciones de ${row.original.sku}`}
                        opciones={[
                            {
                                etiqueta: 'Ver kardex',
                                alElegir: () => {
                                    alVerKardex(row.original.idVariante);
                                },
                            },
                            {
                                etiqueta: 'Registrar movimiento',
                                alElegir: () => {
                                    alRegistrar(row.original);
                                },
                            },
                        ]}
                    />
                ),
            },
        ],
        [limiteBajo, alVerKardex, alRegistrar],
    );

    return (
        <TablaDatos
            etiqueta="Existencias"
            columnas={columnas}
            filas={consulta.data?.data}
            idFila={(f) => String(f.idVariante)}
            cargando={consulta.isPending}
            actualizando={consulta.isPlaceholderData}
            error={
                consulta.isError ? (
                    <EstadoError
                        titulo="No pudimos cargar las existencias"
                        mensaje={consulta.error.message}
                        referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                        alReintentar={() => void consulta.refetch()}
                    />
                ) : undefined
            }
            vacio={
                <EstadoVacio
                    icono={PackageSearch}
                    titulo="No hay variantes con estos filtros"
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
            unidad="variantes"
            alCambiarPagina={lista.irAPagina}
            tarjeta={(f) => (
                <div className={estilos.tarjeta}>
                    <div className={estilos.tarjetaCabecera}>
                        <div>
                            <strong>{f.producto}</strong>
                            <small className={estilos.detalle}>
                                {f.sku}
                                {f.descripcion && ` · ${f.descripcion}`} · reservado {f.reservado}
                            </small>
                        </div>
                        <InsigniaExistencia estado={estadoDeExistencia(f, limiteBajo)} />
                    </div>
                    <div className={estilos.tarjetaPie}>
                        <span className="numero">
                            Disponible <strong>{f.disponible}</strong> de {f.existenciaFisica}
                        </span>
                        <MenuAcciones
                            etiqueta={`Acciones de ${f.sku}`}
                            opciones={[
                                {
                                    etiqueta: 'Ver kardex',
                                    alElegir: () => {
                                        alVerKardex(f.idVariante);
                                    },
                                },
                                {
                                    etiqueta: 'Registrar movimiento',
                                    alElegir: () => {
                                        alRegistrar(f);
                                    },
                                },
                            ]}
                        />
                    </div>
                </div>
            )}
            ordenesMovil={ORDENES_MOVIL}
            alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                lista.fijarOrden(ordenarPor, direccion);
            }}
            filtros={
                <div className={estilos.filtros}>
                    <div className={estilos.buscador}>
                        <BuscadorTabla
                            etiqueta="SKU o producto"
                            valor={lista.busqueda}
                            alCambiar={(valor) => {
                                lista.filtrar('busqueda', valor);
                            }}
                        />
                    </div>
                    <div className={estilos.selector}>
                        <Selector
                            etiqueta="Categoría"
                            compacto
                            valor={lista.categoria}
                            opciones={lista.opcionesCategoria}
                            alCambiar={(valor) => {
                                lista.filtrar('categoria', valor);
                            }}
                        />
                    </div>
                    <div className={estilos.selector}>
                        <Selector
                            etiqueta="Estado"
                            compacto
                            valor={lista.estado}
                            opciones={ESTADOS_EXISTENCIA}
                            alCambiar={(valor) => {
                                lista.filtrar('estado', valor);
                            }}
                        />
                    </div>
                </div>
            }
        />
    );
}
