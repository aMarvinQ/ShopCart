import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, FolderTree, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { AreaTexto, Campo, CampoBusqueda } from '../../../ui/Campo';
import { Casilla, Interruptor } from '../../../ui/Controles';
import { Esqueleto } from '../../../ui/Esqueleto';
import { Alerta, Cajon, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { TablaCompleta } from '../../../ui/TablaDatos';
import {
    useCategoriasPanel,
    useDetalleCategoria,
    useFormularioCategoria,
    type Categoria,
} from './hooks/useCategoriasPanel';
import estilos from './catalogo.module.scss';

function CuerpoFormulario({ categoria, alTerminar }: { categoria: Categoria | null; alTerminar: () => void }) {
    const form = useFormularioCategoria(categoria, alTerminar);
    const {
        register,
        formState: { errors },
    } = form.formulario;
    const nombre = register('nombre');
    const slug = register('slug');
    const nombresPorId = new Map(form.atributos.map((a) => [a.idAtributo, a.nombre]));

    return (
        <form className={estilos.formulario} noValidate onSubmit={(e) => void form.enviar(e)}>
            {form.errorGeneral && <Alerta tipo="error">{form.errorGeneral}</Alerta>}
            <Campo
                etiqueta="Nombre"
                error={errors.nombre?.message}
                {...nombre}
                onChange={(evento) => {
                    void nombre.onChange(evento);
                    form.alEscribirNombre(evento.target.value);
                }}
            />
            <Campo
                etiqueta="Dirección en la tienda"
                ayuda="Aparece en el enlace de la categoría: minúsculas, números y guiones."
                error={errors.slug?.message}
                {...slug}
                onChange={(evento) => {
                    void slug.onChange(evento);
                    form.alEditarSlug();
                }}
            />
            <AreaTexto
                etiqueta="Descripción (opcional)"
                filas={2}
                maxLength={500}
                error={errors.descripcion?.message}
                {...form.formulario.register('descripcion')}
            />
            <fieldset className={estilos.grupo}>
                <legend>Atributos de sus productos</legend>
                <p className={estilos.ayuda}>Son los selectores del detalle, como Color o Talla, en este orden.</p>
                {form.elegidos.length > 0 && (
                    <ol className={estilos.elegidos}>
                        {form.elegidos.map((id, indice) => (
                            <li key={id}>
                                <span>{nombresPorId.get(id) ?? `Atributo ${String(id)}`}</span>
                                <Boton
                                    variante="fantasma"
                                    tamano="sm"
                                    icono={ArrowUp}
                                    aria-label={`Subir ${nombresPorId.get(id) ?? ''}`}
                                    disabled={indice === 0}
                                    onClick={() => {
                                        form.moverAtributo(indice, -1);
                                    }}
                                />
                                <Boton
                                    variante="fantasma"
                                    tamano="sm"
                                    icono={ArrowDown}
                                    aria-label={`Bajar ${nombresPorId.get(id) ?? ''}`}
                                    disabled={indice === form.elegidos.length - 1}
                                    onClick={() => {
                                        form.moverAtributo(indice, 1);
                                    }}
                                />
                            </li>
                        ))}
                    </ol>
                )}
                {form.atributos
                    .filter((a) => a.activo || form.elegidos.includes(a.idAtributo))
                    .map((a) => (
                        <Casilla
                            key={a.idAtributo}
                            etiqueta={form.enUso(a.idAtributo) ? `${a.nombre} (en uso por variantes)` : a.nombre}
                            checked={form.elegidos.includes(a.idAtributo)}
                            disabled={form.enUso(a.idAtributo)}
                            onChange={() => {
                                form.alternarAtributo(a.idAtributo);
                            }}
                        />
                    ))}
            </fieldset>
            <Boton type="submit" anchoCompleto cargando={form.guardando}>
                {categoria ? 'Guardar cambios' : 'Crear categoría'}
            </Boton>
        </form>
    );
}

/** Al editar se consulta la categoría: trae la versión para detectar cambios ajenos y qué atributos están en uso. */
function FormularioCategoria({ id, alTerminar }: { id: number | null; alTerminar: () => void }) {
    const detalle = useDetalleCategoria(id);
    if (id === null) return <CuerpoFormulario categoria={null} alTerminar={alTerminar} />;
    if (detalle.isPending) {
        return (
            <div role="status" aria-label="Cargando categoría">
                <Esqueleto alto="20rem" />
            </div>
        );
    }
    if (detalle.isError) {
        return (
            <EstadoError
                titulo="No pudimos cargar la categoría"
                mensaje={detalle.error.message}
                alReintentar={() => void detalle.refetch()}
            />
        );
    }
    return <CuerpoFormulario key={detalle.dataUpdatedAt} categoria={detalle.data.data} alTerminar={alTerminar} />;
}

export function Categorias() {
    const lista = useCategoriasPanel();
    const { consulta } = lista;
    const [edicion, setEdicion] = useState<{ id: number | null } | null>(null);

    const columnas = useMemo<ColumnDef<Categoria>[]>(
        () => [
            {
                header: 'Categoría',
                accessorKey: 'nombre',
                cell: ({ row }) => (
                    <>
                        <strong>{row.original.nombre}</strong>
                        <small className={estilos.detalle}>/{row.original.slug}</small>
                    </>
                ),
            },
            {
                id: 'atributos',
                header: 'Atributos',
                cell: ({ row }) => row.original.atributos.map((a) => a.nombre).join(', ') || '—',
            },
            {
                id: 'productos',
                header: 'Productos activos',
                meta: { derecha: true },
                cell: ({ row }) =>
                    `${String(row.original.productosActivos)} de ${String(row.original.productosTotales)}`,
            },
            {
                id: 'activo',
                header: 'Activa',
                cell: ({ row }) => (
                    <Interruptor
                        etiqueta={`Activa: ${row.original.nombre}`}
                        etiquetaOculta
                        checked={row.original.activo}
                        disabled={lista.cambiando}
                        onChange={() => {
                            lista.alternar(row.original);
                        }}
                    />
                ),
            },
            {
                id: 'acciones',
                header: () => <span className="visually-hidden">Acciones</span>,
                meta: { derecha: true },
                cell: ({ row }) => (
                    <Boton
                        variante="fantasma"
                        icono={Pencil}
                        aria-label={`Editar ${row.original.nombre}`}
                        onClick={() => {
                            setEdicion({ id: row.original.idCategoria });
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
            <TablaCompleta
                etiqueta="Categorías"
                columnas={columnas}
                filas={lista.filas}
                idFila={(c) => String(c.idCategoria)}
                cargando={consulta.isPending}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar las categorías"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={FolderTree}
                        titulo={lista.busqueda ? 'Ninguna categoría coincide' : 'Aún no hay categorías'}
                    />
                }
                unidad="categorías"
                filtros={
                    <div className={estilos.buscador}>
                        <CampoBusqueda
                            etiqueta="Nombre de la categoría"
                            compacto
                            placeholder="Nombre de la categoría"
                            value={lista.busqueda}
                            onChange={({ target }) => {
                                lista.buscar(target.value);
                            }}
                        />
                    </div>
                }
                acciones={
                    <Boton
                        icono={Plus}
                        onClick={() => {
                            setEdicion({ id: null });
                        }}
                    >
                        Nueva categoría
                    </Boton>
                }
                tarjeta={(c) => (
                    <div className={estilos.tarjeta}>
                        <div>
                            <strong>{c.nombre}</strong>
                            <small className={estilos.detalle}>
                                {c.productosActivos} de {c.productosTotales} productos activos
                                {c.atributos.length > 0 && ` · ${c.atributos.map((a) => a.nombre).join(', ')}`}
                            </small>
                        </div>
                        <Interruptor
                            etiqueta={`Activa: ${c.nombre}`}
                            etiquetaOculta
                            checked={c.activo}
                            disabled={lista.cambiando}
                            onChange={() => {
                                lista.alternar(c);
                            }}
                        />
                        <Boton
                            variante="fantasma"
                            icono={Pencil}
                            aria-label={`Editar ${c.nombre}`}
                            onClick={() => {
                                setEdicion({ id: c.idCategoria });
                            }}
                        />
                    </div>
                )}
            />
            <Cajon
                mostrar={edicion !== null}
                titulo={edicion?.id ? 'Editar categoría' : 'Nueva categoría'}
                alCerrar={() => {
                    setEdicion(null);
                }}
            >
                {edicion && (
                    <FormularioCategoria
                        id={edicion.id}
                        alTerminar={() => {
                            setEdicion(null);
                        }}
                    />
                )}
            </Cajon>
            <DialogoConfirmacion
                mostrar={lista.porDesactivar !== null}
                titulo={`¿Desactivar ${lista.porDesactivar?.nombre ?? ''}?`}
                textoConfirmar="Sí, desactivar"
                cargando={lista.cambiando}
                alCancelar={lista.desistir}
                alConfirmar={lista.confirmarDesactivar}
            >
                Sus productos dejarán de verse en la tienda, sin cambiar el estado de cada uno. Puedes reactivarla
                después.
            </DialogoConfirmacion>
        </>
    );
}
