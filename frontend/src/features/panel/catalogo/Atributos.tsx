import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Pencil, Plus, Tags } from 'lucide-react';
import { useMemo, useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Campo, CampoBusqueda } from '../../../ui/Campo';
import { Interruptor } from '../../../ui/Controles';
import { Esqueleto } from '../../../ui/Esqueleto';
import { Alerta, Cajon, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { TablaCompleta } from '../../../ui/TablaDatos';
import { DatosValor, Muestra } from './DatosValor';
import { useAtributosPanel, useEdicionAtributo, type Atributo } from './hooks/useAtributosPanel';
import estilos from './catalogo.module.scss';

function EdicionAtributo({ idInicial }: { idInicial: number | null }) {
    const [id, setId] = useState(idInicial);
    const edicion = useEdicionAtributo(id, setId);
    const [editando, setEditando] = useState<number | null>(null);
    const {
        register,
        formState: { errors },
    } = edicion.formulario;

    if (id !== null && edicion.detalle.isPending) {
        return (
            <div role="status" aria-label="Cargando atributo">
                <Esqueleto alto="14rem" />
            </div>
        );
    }

    return (
        <div className={estilos.formulario}>
            {edicion.errorGeneral && <Alerta tipo="error">{edicion.errorGeneral}</Alerta>}
            <form noValidate className={estilos.nombreAtributo} onSubmit={(e) => void edicion.guardarNombre(e)}>
                <Campo etiqueta="Nombre" error={errors.nombre?.message} {...register('nombre')} />
                <Boton
                    type="submit"
                    variante={id === null ? 'primario' : 'secundario'}
                    cargando={edicion.guardandoNombre}
                >
                    {id === null ? 'Crear' : 'Guardar'}
                </Boton>
            </form>
            {id === null ? (
                <p className={estilos.ayuda}>Después de crearlo podrás agregar sus valores.</p>
            ) : (
                <section className={estilos.grupo}>
                    <h3>Valores</h3>
                    {edicion.valores.length === 0 && <p className={estilos.ayuda}>Aún no tiene valores.</p>}
                    <ul className={estilos.valores}>
                        {edicion.valores.map((valor, indice) => (
                            <li key={valor.idAtributoValor}>
                                {editando === valor.idAtributoValor ? (
                                    <DatosValor
                                        inicial={valor}
                                        textoBoton="Guardar"
                                        ocupado={edicion.ocupado}
                                        alCancelar={() => {
                                            setEditando(null);
                                        }}
                                        alGuardar={(texto, codigoHex) =>
                                            edicion.editarValor({ valor, texto, codigoHex })
                                        }
                                    />
                                ) : (
                                    <>
                                        <Muestra color={valor.codigoHex} />
                                        <span className={estilos.valorTexto}>
                                            {valor.valor}
                                            {valor.enUso && (
                                                <small className={estilos.detalle}>En uso por variantes</small>
                                            )}
                                        </span>
                                        <Boton
                                            variante="fantasma"
                                            tamano="sm"
                                            icono={ArrowUp}
                                            aria-label={`Subir ${valor.valor}`}
                                            disabled={indice === 0 || edicion.ocupado}
                                            onClick={() => {
                                                edicion.moverValor({ indice, sentido: -1 });
                                            }}
                                        />
                                        <Boton
                                            variante="fantasma"
                                            tamano="sm"
                                            icono={ArrowDown}
                                            aria-label={`Bajar ${valor.valor}`}
                                            disabled={indice === edicion.valores.length - 1 || edicion.ocupado}
                                            onClick={() => {
                                                edicion.moverValor({ indice, sentido: 1 });
                                            }}
                                        />
                                        <Boton
                                            variante="fantasma"
                                            tamano="sm"
                                            icono={Pencil}
                                            aria-label={`Editar ${valor.valor}`}
                                            onClick={() => {
                                                setEditando(valor.idAtributoValor);
                                            }}
                                        />
                                        <Interruptor
                                            etiqueta={`Activo: ${valor.valor}`}
                                            etiquetaOculta
                                            checked={valor.activo}
                                            disabled={edicion.ocupado}
                                            onChange={() => {
                                                edicion.alternarValor(valor);
                                            }}
                                        />
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                    <h3>Agregar valor</h3>
                    <DatosValor
                        textoBoton="Agregar valor"
                        ocupado={edicion.agregando}
                        alGuardar={(valor, codigoHex) => edicion.agregarValor({ valor, codigoHex })}
                    />
                </section>
            )}
        </div>
    );
}

export function Atributos() {
    const lista = useAtributosPanel();
    const { consulta } = lista;
    const [edicion, setEdicion] = useState<{ id: number | null } | null>(null);

    const columnas = useMemo<ColumnDef<Atributo>[]>(
        () => [
            { header: 'Atributo', accessorKey: 'nombre', cell: ({ row }) => <strong>{row.original.nombre}</strong> },
            {
                id: 'valores',
                header: 'Valores',
                cell: ({ row }) => (
                    <span className={estilos.listaValores}>
                        {row.original.valores
                            .filter((v) => v.activo)
                            .map((v) => (
                                <span key={v.idAtributoValor}>
                                    <Muestra color={v.codigoHex} />
                                    {v.valor}
                                </span>
                            ))}
                    </span>
                ),
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
                            setEdicion({ id: row.original.idAtributo });
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
                etiqueta="Atributos"
                columnas={columnas}
                filas={lista.filas}
                idFila={(a) => String(a.idAtributo)}
                cargando={consulta.isPending}
                error={
                    consulta.isError ? (
                        <EstadoError
                            titulo="No pudimos cargar los atributos"
                            mensaje={consulta.error.message}
                            referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                            alReintentar={() => void consulta.refetch()}
                        />
                    ) : undefined
                }
                vacio={
                    <EstadoVacio
                        icono={Tags}
                        titulo={lista.busqueda ? 'Ningún atributo coincide' : 'Aún no hay atributos'}
                    />
                }
                unidad="atributos"
                filtros={
                    <div className={estilos.buscador}>
                        <CampoBusqueda
                            etiqueta="Atributo o valor"
                            compacto
                            placeholder="Atributo o valor"
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
                        Nuevo atributo
                    </Boton>
                }
                tarjeta={(a) => (
                    <div className={estilos.tarjeta}>
                        <div>
                            <strong>{a.nombre}</strong>
                            <small className={estilos.detalle}>
                                {a.valores
                                    .filter((v) => v.activo)
                                    .map((v) => v.valor)
                                    .join(', ') || 'Sin valores'}
                            </small>
                        </div>
                        <Interruptor
                            etiqueta={`Activo: ${a.nombre}`}
                            etiquetaOculta
                            checked={a.activo}
                            disabled={lista.cambiando}
                            onChange={() => {
                                lista.alternar(a);
                            }}
                        />
                        <Boton
                            variante="fantasma"
                            icono={Pencil}
                            aria-label={`Editar ${a.nombre}`}
                            onClick={() => {
                                setEdicion({ id: a.idAtributo });
                            }}
                        />
                    </div>
                )}
            />
            <Cajon
                mostrar={edicion !== null}
                titulo={edicion?.id ? 'Editar atributo' : 'Nuevo atributo'}
                alCerrar={() => {
                    setEdicion(null);
                }}
            >
                {edicion && <EdicionAtributo key={edicion.id ?? 'nuevo'} idInicial={edicion.id} />}
            </Cajon>
            <DialogoConfirmacion
                mostrar={lista.porDesactivar !== null}
                titulo={`¿Desactivar ${lista.porDesactivar?.nombre ?? ''}?`}
                textoConfirmar="Sí, desactivar"
                cargando={lista.cambiando}
                alCancelar={lista.desistir}
                alConfirmar={lista.confirmarDesactivar}
            >
                Dejará de ofrecerse para asignar a categorías y variantes nuevas. Puedes reactivarlo después.
            </DialogoConfirmacion>
        </>
    );
}
