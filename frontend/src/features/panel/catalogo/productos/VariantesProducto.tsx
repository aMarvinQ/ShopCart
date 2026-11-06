import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeftRight, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Boton } from '../../../../ui/Boton';
import { Campo } from '../../../../ui/Campo';
import { Interruptor } from '../../../../ui/Controles';
import { Alerta, Cajon, EstadoVacio } from '../../../../ui/Mensajes';
import { TablaCompleta } from '../../../../ui/TablaDatos';
import { moneda } from '../../../../utils/formato';
import { FormularioMovimiento } from '../../inventario/FormularioMovimiento';
import { EditorVariantes } from './EditorVariantes';
import { GrupoPlegable } from './GrupoPlegable';
import type { Producto, Variante } from './hooks/useEdicionProducto';
import {
    nombreVariante,
    useAgregarVariantes,
    useEdicionVariante,
    useVariantesProducto,
} from './hooks/useVariantesProducto';
import estilos from './productos.module.scss';

function FormularioVariante({
    producto,
    variante,
    alTerminar,
}: {
    producto: Producto;
    variante: Variante;
    alTerminar: () => void;
}) {
    const edicion = useEdicionVariante(producto, variante, alTerminar);
    return (
        <form
            noValidate
            className={estilos.formulario}
            onSubmit={(evento) => {
                evento.preventDefault();
                edicion.enviar();
            }}
        >
            <Campo
                etiqueta="SKU"
                maxLength={50}
                value={edicion.sku}
                error={edicion.errores.sku}
                onChange={({ target }) => {
                    edicion.setSku(target.value);
                }}
            />
            <Campo
                etiqueta="Precio"
                inputMode="decimal"
                ayuda="IVA incluido. El cambio queda en el historial."
                value={edicion.precio}
                error={edicion.errores.precio}
                onChange={({ target }) => {
                    edicion.setPrecio(target.value);
                }}
            />
            <Boton type="submit" anchoCompleto cargando={edicion.guardando}>
                Guardar cambios
            </Boton>
        </form>
    );
}

function AgregarVariantes({ producto, alTerminar }: { producto: Producto; alTerminar: () => void }) {
    const agregar = useAgregarVariantes(producto, alTerminar);
    return (
        <div className={estilos.formulario}>
            {agregar.error && <Alerta tipo="error">{agregar.error}</Alerta>}
            <EditorVariantes generador={agregar.generador} />
            <Boton anchoCompleto cargando={agregar.agregando} onClick={agregar.enviar}>
                Agregar variantes
            </Boton>
        </div>
    );
}

export function VariantesProducto({ producto }: { producto: Producto }) {
    const { grupos, alternarGrupo, cambiando, alternar, idUltimaActiva, admiteMas, paraMovimiento } =
        useVariantesProducto(producto);
    const [editando, setEditando] = useState<number | null>(null);
    const [agregando, setAgregando] = useState(false);
    const [moviendo, setMoviendo] = useState(false);
    const varianteEditada = producto.variantes.find((v) => v.idVariante === editando);

    const columnas = useMemo<ColumnDef<Variante>[]>(
        () => [
            {
                id: 'variante',
                header: 'Variante',
                cell: ({ row }) => <strong>{nombreVariante(row.original)}</strong>,
            },
            { header: 'SKU', accessorKey: 'sku' },
            {
                header: 'Precio',
                accessorKey: 'precio',
                meta: { derecha: true },
                cell: ({ row }) => moneda(row.original.precio),
            },
            { header: 'Física', accessorKey: 'existenciaFisica', meta: { derecha: true } },
            { header: 'Disponible', accessorKey: 'disponible', meta: { derecha: true } },
            {
                id: 'activo',
                header: 'Activa',
                cell: ({ row }) => (
                    <Interruptor
                        etiqueta={`Activa: ${row.original.sku}`}
                        etiquetaOculta
                        checked={row.original.activo}
                        disabled={cambiando || row.original.idVariante === idUltimaActiva}
                        onChange={() => {
                            alternar(row.original);
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
                        aria-label={`Editar ${row.original.sku}`}
                        onClick={() => {
                            setEditando(row.original.idVariante);
                        }}
                    />
                ),
            },
        ],
        [cambiando, alternar, idUltimaActiva],
    );

    const tarjetaVariante = (v: Variante) => (
        <div className={estilos.tarjeta}>
            <div className={estilos.tarjetaDatos}>
                <strong>{nombreVariante(v)}</strong>
                <small className={estilos.detalle}>
                    {v.sku} · disponible {v.disponible}
                </small>
                <strong className="numero">{moneda(v.precio)}</strong>
            </div>
            <Interruptor
                etiqueta={`Activa: ${v.sku}`}
                etiquetaOculta
                checked={v.activo}
                disabled={cambiando || v.idVariante === idUltimaActiva}
                onChange={() => {
                    alternar(v);
                }}
            />
            <Boton
                variante="fantasma"
                icono={Pencil}
                aria-label={`Editar ${v.sku}`}
                onClick={() => {
                    setEditando(v.idVariante);
                }}
            />
        </div>
    );

    return (
        <>
            <div className={estilos.barraVariantes}>
                <div className={estilos.ayuda}>
                    {idUltimaActiva !== null && (
                        <p className="m-0">La última variante activa no se desactiva: oculta el producto.</p>
                    )}
                    {!admiteMas && <p className="m-0">Este producto se creó sin atributos: no admite más variantes.</p>}
                </div>
                <div className={estilos.barraVariantesAcciones}>
                    <Boton
                        variante="secundario"
                        icono={ArrowLeftRight}
                        onClick={() => {
                            setMoviendo(true);
                        }}
                    >
                        Registrar movimiento
                    </Boton>
                    <Boton
                        icono={Plus}
                        disabled={!admiteMas}
                        onClick={() => {
                            setAgregando(true);
                        }}
                    >
                        Agregar variantes
                    </Boton>
                </div>
            </div>
            {grupos.length === 0 ? (
                <TablaCompleta
                    etiqueta="Variantes"
                    columnas={columnas}
                    filas={producto.variantes}
                    idFila={(v) => String(v.idVariante)}
                    cargando={false}
                    vacio={<EstadoVacio icono={Plus} titulo="Aún no tiene variantes" />}
                    unidad="variantes"
                    tarjeta={tarjetaVariante}
                />
            ) : (
                <div className={estilos.gruposVariantes}>
                    {grupos.map((grupo) => (
                        <GrupoPlegable
                            key={grupo.idValor}
                            titulo={grupo.titulo}
                            detalle={`${String(grupo.variantes.length)} ${grupo.variantes.length === 1 ? 'variante' : 'variantes'} · ${String(grupo.disponible)} disponibles`}
                            abierto={grupo.abierto}
                            alAlternar={() => {
                                alternarGrupo(grupo.idValor);
                            }}
                        >
                            <div className={estilos.tablaEnGrupo}>
                                <TablaCompleta
                                    etiqueta={`Variantes de ${grupo.titulo}`}
                                    columnas={columnas}
                                    filas={grupo.variantes}
                                    idFila={(v) => String(v.idVariante)}
                                    cargando={false}
                                    vacio={null}
                                    unidad="variantes"
                                    sinPie
                                    tarjeta={tarjetaVariante}
                                />
                            </div>
                        </GrupoPlegable>
                    ))}
                </div>
            )}
            <Cajon
                mostrar={varianteEditada !== undefined}
                titulo={varianteEditada ? `Editar ${nombreVariante(varianteEditada)}` : 'Editar variante'}
                alCerrar={() => {
                    setEditando(null);
                }}
            >
                {varianteEditada && (
                    <FormularioVariante
                        key={varianteEditada.idVariante}
                        producto={producto}
                        variante={varianteEditada}
                        alTerminar={() => {
                            setEditando(null);
                        }}
                    />
                )}
            </Cajon>
            <Cajon
                mostrar={agregando}
                titulo="Agregar variantes"
                alCerrar={() => {
                    setAgregando(false);
                }}
            >
                {agregando && (
                    <AgregarVariantes
                        producto={producto}
                        alTerminar={() => {
                            setAgregando(false);
                        }}
                    />
                )}
            </Cajon>
            <Cajon
                mostrar={moviendo}
                titulo="Registrar movimiento"
                subtitulo="Entra o sale la cantidad que escribas; deja vacías las demás."
                alCerrar={() => {
                    setMoviendo(false);
                }}
            >
                {moviendo && (
                    <FormularioMovimiento
                        inicial={null}
                        fijas={paraMovimiento}
                        alTerminar={() => {
                            setMoviendo(false);
                        }}
                    />
                )}
            </Cajon>
        </>
    );
}
