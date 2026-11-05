import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, Ellipsis, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Boton } from './Boton';
import { CampoBusqueda } from './Campo';
import { Esqueleto } from './Esqueleto';
import { Paginacion, Tarjeta } from './Navegacion';
import estilos from './TablaDatos.module.scss';

declare module '@tanstack/react-table' {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- la firma debe coincidir con la de la librería
    interface ColumnMeta<TData extends RowData, TValue> {
        /** Cifras y acciones: alineadas a la derecha. */
        derecha?: boolean;
        /** Valor de `ordenarPor` en la API; sin él, la columna no se ordena. */
        ordenarPor?: string;
    }
}

export type DireccionOrden = 'ASC' | 'DESC';
export interface OrdenTabla {
    ordenarPor: string;
    direccion: DireccionOrden;
}

const ESPERA_BUSQUEDA_MS = 300;

/*
    Tabla del sistema: el orden, los filtros y la página los resuelve la API, así la pantalla solo
    guarda la página que está viendo, por grande que sea la lista. Mientras carga muestra filas
    grises de la misma altura que las reales. En móvil, si se da `tarjeta`, cada fila es una tarjeta.
*/
export function TablaDatos<T>({
    columnas,
    filas,
    idFila,
    cargando,
    error,
    vacio,
    orden,
    alOrdenar,
    pagina,
    tamanoPagina,
    totalRegistros,
    unidad,
    alCambiarPagina,
    filtros,
    acciones,
    tarjeta,
    etiqueta,
}: {
    columnas: ColumnDef<T>[];
    filas: readonly T[] | undefined;
    idFila: (fila: T) => string;
    cargando: boolean;
    /** Se muestra en lugar de las filas (normalmente un EstadoError). */
    error?: ReactNode;
    vacio: ReactNode;
    orden: OrdenTabla;
    alOrdenar: (ordenarPor: string) => void;
    pagina: number;
    tamanoPagina: number;
    totalRegistros: number;
    unidad?: string;
    alCambiarPagina: (pagina: number) => void;
    filtros?: ReactNode;
    acciones?: ReactNode;
    tarjeta?: (fila: T) => ReactNode;
    etiqueta: string;
}) {
    // Referencia estable: la tabla recalcula sus filas cada vez que cambia.
    const datos = useMemo(() => (filas ? [...filas] : []), [filas]);
    const tabla = useReactTable<T>({
        data: datos,
        columns: columnas,
        getRowId: idFila,
        getCoreRowModel: getCoreRowModel(),
        manualSorting: true,
        manualPagination: true,
    });
    const encabezados = tabla.getHeaderGroups();
    const totalColumnas = columnas.length;
    const conFilas = !cargando && !error && (filas?.length ?? 0) > 0;
    const sinFilas = !cargando && !error && filas?.length === 0;

    return (
        <Tarjeta>
            {(filtros ?? acciones) && (
                <div className={estilos.barra}>
                    {filtros}
                    {acciones && <div className={estilos.acciones}>{acciones}</div>}
                </div>
            )}
            <div className={`${estilos.desplazable} ${tarjeta ? estilos.soloEscritorio : ''}`}>
                <table className={estilos.tabla} aria-label={etiqueta} aria-busy={cargando}>
                    <thead>
                        {encabezados.map((grupo) => (
                            <tr key={grupo.id}>
                                {grupo.headers.map((columna) => {
                                    const { ordenarPor, derecha } = columna.column.columnDef.meta ?? {};
                                    const activa = ordenarPor !== undefined && orden.ordenarPor === ordenarPor;
                                    const titulo = flexRender(columna.column.columnDef.header, columna.getContext());
                                    return (
                                        <th
                                            key={columna.id}
                                            scope="col"
                                            className={derecha ? estilos.derecha : undefined}
                                            {...(ordenarPor !== undefined && {
                                                'aria-sort': activa
                                                    ? orden.direccion === 'ASC'
                                                        ? ('ascending' as const)
                                                        : ('descending' as const)
                                                    : ('none' as const),
                                            })}
                                        >
                                            {ordenarPor === undefined ? (
                                                titulo
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={`${estilos.orden} ${activa ? estilos.ordenActivo : ''}`}
                                                    onClick={() => {
                                                        alOrdenar(ordenarPor);
                                                    }}
                                                >
                                                    {titulo}
                                                    <IconoOrden activa={activa} direccion={orden.direccion} />
                                                </button>
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        ))}
                    </thead>
                    <tbody>
                        {cargando &&
                            Array.from({ length: tamanoPagina }, (_, fila) => (
                                <tr key={fila} data-testid="fila-esqueleto">
                                    {Array.from({ length: totalColumnas }, (__, celda) => (
                                        <td key={celda}>
                                            <Esqueleto ancho="70%" alto="0.875rem" />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {conFilas &&
                            tabla.getRowModel().rows.map((fila) => (
                                <tr key={fila.id}>
                                    {fila.getVisibleCells().map((celda) => (
                                        <td
                                            key={celda.id}
                                            className={
                                                celda.column.columnDef.meta?.derecha ? estilos.derecha : undefined
                                            }
                                        >
                                            {flexRender(celda.column.columnDef.cell, celda.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        {(sinFilas || error) && (
                            <tr>
                                <td colSpan={totalColumnas} className={estilos.mensaje}>
                                    {error ?? vacio}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {tarjeta && (
                <div className={estilos.soloMovil}>
                    {cargando &&
                        Array.from({ length: Math.min(tamanoPagina, 5) }, (_, i) => (
                            <div key={i} className={estilos.tarjetaFila}>
                                <Esqueleto ancho="60%" />
                                <Esqueleto ancho="40%" style={{ marginTop: '0.5rem' }} />
                            </div>
                        ))}
                    {conFilas &&
                        filas?.map((fila) => (
                            <div key={idFila(fila)} className={estilos.tarjetaFila}>
                                {tarjeta(fila)}
                            </div>
                        ))}
                    {(sinFilas || error) && <div className={estilos.mensaje}>{error ?? vacio}</div>}
                </div>
            )}
            <div className={estilos.pie}>
                {conFilas && (
                    <Paginacion
                        pagina={pagina}
                        tamanoPagina={tamanoPagina}
                        totalRegistros={totalRegistros}
                        alCambiar={alCambiarPagina}
                        {...(unidad !== undefined && { unidad })}
                    />
                )}
            </div>
        </Tarjeta>
    );
}

function IconoOrden({ activa, direccion }: { activa: boolean; direccion: DireccionOrden }) {
    const Icono = activa ? (direccion === 'ASC' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return <Icono size={16} aria-hidden="true" />;
}

/** Búsqueda de una barra de filtros: consulta a la API cuando se deja de escribir, no en cada tecla. */
export function BuscadorTabla({
    etiqueta,
    valor,
    alCambiar,
}: {
    etiqueta: string;
    valor: string;
    alCambiar: (valor: string) => void;
}) {
    const [texto, setTexto] = useState(valor);
    const [anterior, setAnterior] = useState(valor);
    const espera = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Si el filtro cambia desde fuera (botón Atrás), el campo lo refleja.
    if (valor !== anterior) {
        setAnterior(valor);
        setTexto(valor);
    }

    useEffect(
        () => () => {
            clearTimeout(espera.current);
        },
        [],
    );

    return (
        <CampoBusqueda
            etiqueta={etiqueta}
            compacto
            ancho="17.5rem"
            placeholder={etiqueta}
            value={texto}
            onChange={({ target }) => {
                setTexto(target.value);
                clearTimeout(espera.current);
                espera.current = setTimeout(() => {
                    alCambiar(target.value.trim());
                }, ESPERA_BUSQUEDA_MS);
            }}
        />
    );
}

/** Acciones de una fila, en el menú de los tres puntos. */
export function MenuAcciones({
    etiqueta,
    opciones,
}: {
    etiqueta: string;
    opciones: readonly { etiqueta: string; icono?: LucideIcon; alElegir: () => void }[];
}) {
    return (
        <Dropdown align="end">
            <Dropdown.Toggle
                as={Boton}
                bsPrefix={estilos.menuBoton ?? ''}
                variante="fantasma"
                icono={Ellipsis}
                aria-label={etiqueta}
            />
            {/* "fixed": la tabla se desplaza a lo ancho y no debe recortar el menú. */}
            <Dropdown.Menu popperConfig={{ strategy: 'fixed' }}>
                {opciones.map(({ etiqueta: texto, icono: Icono, alElegir }) => (
                    <Dropdown.Item as="button" type="button" key={texto} onClick={alElegir}>
                        {Icono && <Icono size={18} className="me-2" aria-hidden="true" />}
                        {texto}
                    </Dropdown.Item>
                ))}
            </Dropdown.Menu>
        </Dropdown>
    );
}
