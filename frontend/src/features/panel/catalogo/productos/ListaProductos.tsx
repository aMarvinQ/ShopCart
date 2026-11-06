import type { ColumnDef } from '@tanstack/react-table';
import { PackageSearch, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { esErrorApi } from '../../../../api/errores';
import { Boton, BotonEnlace } from '../../../../ui/Boton';
import { Interruptor } from '../../../../ui/Controles';
import { DialogoConfirmacion, EstadoError, EstadoVacio } from '../../../../ui/Mensajes';
import { Selector } from '../../../../ui/Selector';
import { BuscadorTabla, TablaDatos } from '../../../../ui/TablaDatos';
import { moneda } from '../../../../utils/formato';
import { ImagenProducto } from '../../../tienda/TarjetaProducto';
import { ESTADOS_PRODUCTO, ORDENES_MOVIL, useProductosPanel, type FilaProducto } from './hooks/useProductosPanel';
import estilos from './productos.module.scss';

function rangoDePrecio({ precioMinimo, precioMaximo }: FilaProducto) {
    if (precioMinimo === null || precioMaximo === null) return '—';
    return precioMinimo === precioMaximo ? moneda(precioMinimo) : `${moneda(precioMinimo)} – ${moneda(precioMaximo)}`;
}

export function ListaProductos() {
    const lista = useProductosPanel();
    const { consulta } = lista;

    const columnas = useMemo<ColumnDef<FilaProducto>[]>(
        () => [
            {
                header: 'Producto',
                accessorKey: 'nombre',
                meta: { ordenarPor: 'NOMBRE' },
                cell: ({ row }) => (
                    <span className={estilos.filaProducto}>
                        <span className={estilos.miniatura}>
                            <ImagenProducto ruta={row.original.imagenPrincipal} texto="" />
                        </span>
                        <span>
                            <Link
                                to={`productos/${String(row.original.idProducto)}`}
                                className={estilos.enlaceProducto}
                            >
                                <strong>{row.original.nombre}</strong>
                            </Link>
                            <small className={estilos.detalle}>/{row.original.slug}</small>
                        </span>
                    </span>
                ),
            },
            { header: 'Categoría', accessorKey: 'categoria', meta: { ordenarPor: 'CATEGORIA' } },
            {
                id: 'precio',
                header: 'Precio',
                meta: { ordenarPor: 'PRECIO', derecha: true },
                cell: ({ row }) => <span className="text-nowrap">{rangoDePrecio(row.original)}</span>,
            },
            { header: 'Existencia', accessorKey: 'existenciaTotal', meta: { ordenarPor: 'EXISTENCIA', derecha: true } },
            {
                id: 'variantes',
                header: 'Variantes activas',
                meta: { derecha: true },
                cell: ({ row }) =>
                    `${String(row.original.variantesActivas)} de ${String(row.original.variantesTotales)}`,
            },
            {
                id: 'activo',
                header: 'Activo',
                cell: ({ row }) => (
                    <Interruptor
                        etiqueta={`Activo: ${row.original.nombre}`}
                        etiquetaOculta
                        checked={row.original.activo}
                        disabled={lista.cambiando}
                        onChange={() => {
                            lista.alternar(row.original);
                        }}
                    />
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `lista` es nuevo en cada render; lo que se dibuja depende solo de esto
        [lista.cambiando],
    );

    return (
        <>
            <TablaDatos
                etiqueta="Productos"
                columnas={columnas}
                filas={consulta.data?.data}
                idFila={(p) => String(p.idProducto)}
                cargando={consulta.isPending}
                actualizando={consulta.isPlaceholderData}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar los productos"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={PackageSearch}
                        titulo="No hay productos con estos filtros"
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
                unidad="productos"
                alCambiarPagina={lista.irAPagina}
                ordenesMovil={ORDENES_MOVIL}
                alElegirOrdenMovil={({ ordenarPor, direccion }) => {
                    lista.fijarOrden(ordenarPor, direccion);
                }}
                tarjeta={(p) => (
                    <div className={estilos.tarjeta}>
                        <span className={estilos.miniatura}>
                            <ImagenProducto ruta={p.imagenPrincipal} texto="" />
                        </span>
                        <div className={estilos.tarjetaDatos}>
                            <Link to={`productos/${String(p.idProducto)}`} className={estilos.enlaceProducto}>
                                <strong>{p.nombre}</strong>
                            </Link>
                            <small className={estilos.detalle}>
                                {p.categoria} · existencia {p.existenciaTotal}
                            </small>
                            <strong className="numero">{rangoDePrecio(p)}</strong>
                        </div>
                        <Interruptor
                            etiqueta={`Activo: ${p.nombre}`}
                            etiquetaOculta
                            checked={p.activo}
                            disabled={lista.cambiando}
                            onChange={() => {
                                lista.alternar(p);
                            }}
                        />
                    </div>
                )}
                filtros={
                    <div className={estilos.filtros}>
                        <div className={estilos.buscador}>
                            <BuscadorTabla
                                etiqueta="Nombre o SKU"
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
                                opciones={ESTADOS_PRODUCTO}
                                alCambiar={(valor) => {
                                    lista.filtrar('estado', valor);
                                }}
                            />
                        </div>
                    </div>
                }
                acciones={
                    <BotonEnlace to="/panel/catalogo/productos/nuevo" icono={Plus}>
                        Nuevo producto
                    </BotonEnlace>
                }
            />
            <DialogoConfirmacion
                mostrar={lista.porDesactivar !== null}
                titulo={`¿Desactivar ${lista.porDesactivar?.nombre ?? ''}?`}
                textoConfirmar="Sí, desactivar"
                cargando={lista.cambiando}
                alCancelar={lista.desistir}
                alConfirmar={lista.confirmarDesactivar}
            >
                Dejará de verse en la tienda. Los pedidos ya hechos no cambian y puedes reactivarlo después.
            </DialogoConfirmacion>
        </>
    );
}
