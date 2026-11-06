import { Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Boton } from '../../../../ui/Boton';
import { Campo } from '../../../../ui/Campo';
import { Casilla } from '../../../../ui/Controles';
import { Esqueleto } from '../../../../ui/Esqueleto';
import { Alerta } from '../../../../ui/Mensajes';
import { DatosValor } from '../DatosValor';
import { GrupoPlegable } from './GrupoPlegable';
import type { useGeneradorVariantes } from './hooks/useGeneradorVariantes';
import estilos from './productos.module.scss';

type Generador = ReturnType<typeof useGeneradorVariantes>;

/** Valores que se ven sin expandir; los marcados se ven siempre. */
const VALORES_VISIBLES = 6;

/** Valores de un atributo: truncados si son muchos, y con el + siempre a la vista. */
function ValoresAtributo({ generador, atributo }: { generador: Generador; atributo: Generador['atributos'][number] }) {
    const [expandido, setExpandido] = useState(false);
    const [agregando, setAgregando] = useState(false);
    const visibles = expandido
        ? atributo.valores
        : atributo.valores.filter((v, i) => i < VALORES_VISIBLES || generador.elegidos.has(v.idAtributoValor));
    const ocultos = atributo.valores.length - visibles.length;

    return (
        <fieldset className={estilos.atributo}>
            <legend>{atributo.nombre}</legend>
            <div className={estilos.valores}>
                {visibles.map((v) => (
                    <Casilla
                        key={v.idAtributoValor}
                        etiqueta={v.valor}
                        checked={generador.elegidos.has(v.idAtributoValor)}
                        onChange={() => {
                            generador.alternarValor(v.idAtributoValor);
                        }}
                    />
                ))}
                <Boton
                    variante="fantasma"
                    tamano="sm"
                    icono={Plus}
                    aria-label={`Agregar valor a ${atributo.nombre}`}
                    aria-expanded={agregando}
                    title={`Agregar valor a ${atributo.nombre}`}
                    onClick={() => {
                        setAgregando(!agregando);
                    }}
                />
                {(ocultos > 0 || expandido) && atributo.valores.length > VALORES_VISIBLES && (
                    <Boton
                        variante="enlace"
                        tamano="sm"
                        onClick={() => {
                            setExpandido(!expandido);
                        }}
                    >
                        {expandido ? 'Ver menos' : `Ver ${String(ocultos)} más`}
                    </Boton>
                )}
                {agregando && (
                    <div className={`card ${estilos.panelValor}`}>
                        <DatosValor
                            enfocar
                            textoBoton={`Agregar a ${atributo.nombre}`}
                            conColorInicial={atributo.usaColor}
                            ocupado={generador.creandoValor}
                            alGuardar={(valor, color) => generador.crearValor(atributo.idAtributo, valor, color)}
                            alCancelar={() => {
                                setAgregando(false);
                            }}
                        />
                    </div>
                )}
            </div>
        </fieldset>
    );
}

/** Campo de una fila: el título se ve cuando no hay encabezados y el campo compacto no muestra su error. */
function CeldaFila({
    className,
    titulo,
    etiqueta,
    error,
    alEscribir,
    ...campo
}: {
    className?: string | undefined;
    titulo: string;
    etiqueta: string;
    error: string | undefined;
    value: string;
    maxLength?: number;
    inputMode?: 'decimal' | 'numeric';
    alEscribir: (texto: string) => void;
}) {
    return (
        <div className={className}>
            <small className={estilos.etiquetaFila} aria-hidden="true">
                {titulo}
            </small>
            <Campo
                {...campo}
                etiqueta={etiqueta}
                compacto
                error={error}
                onChange={({ target }) => {
                    alEscribir(target.value);
                }}
            />
            {error && <small className={estilos.errorFila}>{error}</small>}
        </div>
    );
}

function FilasVariantes({ generador, filas }: { generador: Generador; filas: Generador['filas'] }) {
    return (
        <>
            <div className={estilos.encabezadoVariantes} aria-hidden="true">
                <span>Variante</span>
                <span>SKU</span>
                <span>Precio</span>
                <span>Existencia inicial</span>
                <span />
            </div>
            <ul className={estilos.filasVariante}>
                {filas.map((f) => {
                    const nombreFila = f.valores.map((v) => v.valor).join(' / ') || 'Única';
                    const mostrar = generador.mostrarErrores;
                    return (
                        <li key={f.clave}>
                            <strong className={estilos.combinacion}>{nombreFila}</strong>
                            <CeldaFila
                                className={estilos.celdaSku}
                                titulo="SKU"
                                etiqueta={`SKU de ${nombreFila}`}
                                maxLength={50}
                                value={f.sku}
                                error={mostrar ? generador.errorSku(f.sku) : undefined}
                                alEscribir={(sku) => {
                                    generador.editarFila(f.clave, { sku });
                                }}
                            />
                            <CeldaFila
                                titulo="Precio"
                                etiqueta={`Precio de ${nombreFila}`}
                                inputMode="decimal"
                                value={f.precio}
                                error={mostrar ? generador.errorPrecio(f.precio) : undefined}
                                alEscribir={(precio) => {
                                    generador.editarFila(f.clave, { precio });
                                }}
                            />
                            <CeldaFila
                                titulo="Existencia inicial"
                                etiqueta={`Existencia inicial de ${nombreFila}`}
                                inputMode="numeric"
                                value={f.existencia}
                                error={mostrar ? generador.errorExistencia(f.existencia) : undefined}
                                alEscribir={(existencia) => {
                                    generador.editarFila(f.clave, { existencia });
                                }}
                            />
                            <Boton
                                variante="fantasma"
                                tamano="sm"
                                icono={X}
                                className={estilos.quitarFila ?? ''}
                                aria-label={`Quitar ${nombreFila}`}
                                onClick={() => {
                                    generador.editarFila(f.clave, { quitada: true });
                                }}
                            />
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

/** Se marcan valores y aparece una fila por combinación: con SKU, precio y existencia inicial. */
export function EditorVariantes({ generador }: { generador: Generador }) {
    if (!generador.hayCategoria) {
        return <p className={estilos.ayuda}>Elige la categoría para ver qué atributos tienen sus productos.</p>;
    }
    if (generador.cargando) return <Esqueleto alto="6rem" />;
    return (
        <>
            {generador.atributos.length === 0 && (
                <p className={estilos.ayuda}>Esta categoría no tiene atributos: el producto lleva una sola variante.</p>
            )}
            {generador.atributos.map((a) => (
                <ValoresAtributo key={a.idAtributo} generador={generador} atributo={a} />
            ))}
            <div className={estilos.valoresBase}>
                <Campo
                    etiqueta="Precio para todas"
                    inputMode="decimal"
                    placeholder="0.00"
                    ayuda="IVA incluido."
                    value={generador.precioBase}
                    onChange={({ target }) => {
                        generador.cambiarPrecioBase(target.value);
                    }}
                />
                <Campo
                    etiqueta="Existencia para todas"
                    inputMode="numeric"
                    placeholder="0"
                    ayuda="Unidades iniciales de cada una."
                    value={generador.existenciaBase}
                    onChange={({ target }) => {
                        generador.cambiarExistenciaBase(target.value);
                    }}
                />
            </div>
            {generador.demasiadas && (
                <Alerta tipo="aviso">
                    Con esta selección serían {generador.total} combinaciones; el máximo es 100. Quita algunos valores.
                </Alerta>
            )}
            {generador.filas.length > 0 && (
                <div className={estilos.tablaVariantes}>
                    {generador.gruposFilas.length === 0 ? (
                        <FilasVariantes generador={generador} filas={generador.filas} />
                    ) : (
                        <div className={estilos.gruposVariantes}>
                            {generador.gruposFilas.map((grupo) => (
                                <GrupoPlegable
                                    key={grupo.idValor}
                                    titulo={grupo.titulo}
                                    detalle={`${String(grupo.filas.length)} ${grupo.filas.length === 1 ? 'variante' : 'variantes'}`}
                                    aviso={grupo.conError ? 'Revisa sus datos' : undefined}
                                    abierto={grupo.abierto}
                                    alAlternar={() => {
                                        generador.alternarGrupo(grupo.idValor);
                                    }}
                                >
                                    <div className={estilos.cuerpoGrupo}>
                                        <FilasVariantes generador={generador} filas={grupo.filas} />
                                    </div>
                                </GrupoPlegable>
                            ))}
                        </div>
                    )}
                    <p className={estilos.ayuda}>
                        La existencia queda en el kardex como inventario inicial. Después se cambia con un movimiento.
                    </p>
                </div>
            )}
        </>
    );
}
