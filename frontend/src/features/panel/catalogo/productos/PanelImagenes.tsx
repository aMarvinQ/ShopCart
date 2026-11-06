import { ArrowLeft, ArrowRight, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Boton } from '../../../../ui/Boton';
import { Campo } from '../../../../ui/Campo';
import { Alerta } from '../../../../ui/Mensajes';
import { Tarjeta } from '../../../../ui/Navegacion';
import { Selector } from '../../../../ui/Selector';
import { GrupoPlegable } from './GrupoPlegable';
import { SubidorImagenes } from './SubidorImagenes';
import estilos from './productos.module.scss';

export interface ImagenDePanel {
    clave: string;
    ruta: string;
    texto: string;
    esPrincipal: boolean;
}

/** Lo que el panel necesita para crear y para editar: cada pantalla decide cómo se guarda cada acción. */
export interface DatosPanelImagenes {
    ayuda: string;
    general: readonly ImagenDePanel[];
    atributos: readonly { idAtributo: number; nombre: string }[];
    idAtributo: number | null;
    /** Las imágenes por valor son todas de un atributo: con alguna subida, ya no se cambia. */
    atributoFijo: boolean;
    elegirAtributo: (idAtributo: number) => void;
    valores: readonly { idValor: number; titulo: string; imagenes: readonly ImagenDePanel[] }[];
    /** Mensaje si el atributo elegido aún no tiene valores que ofrecer. */
    sinValores: string;
    aviso?: string | undefined;
    ocupado: boolean;
    eliminable: boolean;
    motivoNoEliminable?: string | undefined;
    /** Guarda la descripción y devuelve la que debe verse. */
    cambiarTexto: (clave: string, texto: string) => string;
    /** Lleva la imagen a otra posición de su grupo; las demás se recorren. */
    reordenar: (idValor: number | null, desde: number, hasta: number) => void;
    hacerPrincipal?: ((clave: string) => void) | undefined;
    eliminar: (clave: string) => void;
    subir: (rutas: string[], idValor: number | null) => void;
}

const contar = (cantidad: number) => `${String(cantidad)} ${cantidad === 1 ? 'imagen' : 'imágenes'}`;

function Grupo({
    panel,
    idValor,
    titulo,
    imagenes,
}: {
    panel: DatosPanelImagenes;
    idValor: number | null;
    titulo: string;
    imagenes: readonly ImagenDePanel[];
}) {
    const [desde, setDesde] = useState<number | null>(null);
    const [sobre, setSobre] = useState<number | null>(null);
    const soltarTodo = () => {
        setDesde(null);
        setSobre(null);
    };

    return (
        <div className={estilos.imagenes}>
            {imagenes.map((img, indice) => {
                const posicion = `${String(indice + 1)} de ${titulo}`;
                return (
                    <div
                        key={img.clave}
                        className={`${estilos.imagenEdicion} ${desde === indice ? estilos.arrastrando : ''} ${
                            sobre === indice && desde !== indice ? estilos.destinoArrastre : ''
                        }`}
                        // Solo se reacomoda dentro del grupo: un archivo u otra imagen no son destino válido.
                        onDragOver={(evento) => {
                            if (desde === null) return;
                            evento.preventDefault();
                            setSobre(indice);
                        }}
                        onDrop={(evento) => {
                            if (desde === null) return;
                            evento.preventDefault();
                            if (desde !== indice) panel.reordenar(idValor, desde, indice);
                            soltarTodo();
                        }}
                    >
                        <div
                            className={`${estilos.imagen} ${panel.ocupado ? '' : estilos.arrastrable}`}
                            draggable={!panel.ocupado}
                            title={panel.ocupado ? undefined : 'Arrastra para ordenar'}
                            onDragStart={(evento) => {
                                evento.dataTransfer.effectAllowed = 'move';
                                evento.dataTransfer.setData('text/plain', img.clave);
                                setDesde(indice);
                            }}
                            onDragEnd={soltarTodo}
                        >
                            <img src={img.ruta} alt="" loading="lazy" draggable={false} />
                            {img.esPrincipal && <span className={`badge ${estilos.principal}`}>Principal</span>}
                        </div>
                        <Campo
                            key={img.texto}
                            etiqueta="Descripción"
                            maxLength={200}
                            defaultValue={img.texto}
                            onBlur={({ target }) => {
                                target.value = panel.cambiarTexto(img.clave, target.value);
                            }}
                        />
                        <div className={estilos.imagenAcciones}>
                            <Boton
                                variante="fantasma"
                                tamano="sm"
                                icono={ArrowLeft}
                                aria-label={`Mover imagen ${posicion} a la izquierda`}
                                disabled={indice === 0 || panel.ocupado}
                                onClick={() => {
                                    panel.reordenar(idValor, indice, indice - 1);
                                }}
                            />
                            <Boton
                                variante="fantasma"
                                tamano="sm"
                                icono={ArrowRight}
                                aria-label={`Mover imagen ${posicion} a la derecha`}
                                disabled={indice === imagenes.length - 1 || panel.ocupado}
                                onClick={() => {
                                    panel.reordenar(idValor, indice, indice + 1);
                                }}
                            />
                            {panel.hacerPrincipal && (
                                <Boton
                                    variante="fantasma"
                                    tamano="sm"
                                    icono={Star}
                                    aria-label={`Hacer principal la imagen ${posicion}`}
                                    title="Hacer principal"
                                    disabled={img.esPrincipal || panel.ocupado}
                                    onClick={() => {
                                        panel.hacerPrincipal?.(img.clave);
                                    }}
                                />
                            )}
                            <Boton
                                variante="fantasma"
                                tamano="sm"
                                icono={Trash2}
                                aria-label={`Eliminar imagen ${posicion}`}
                                title={panel.eliminable ? undefined : panel.motivoNoEliminable}
                                disabled={!panel.eliminable}
                                onClick={() => {
                                    panel.eliminar(img.clave);
                                }}
                            />
                        </div>
                    </div>
                );
            })}
            <SubidorImagenes
                alSubir={(rutas) => {
                    panel.subir(rutas, idValor);
                }}
            />
        </div>
    );
}

/** Imágenes en desplegables: las generales a la vista y, aparte, las de cada valor del atributo que se elija. */
export function PanelImagenes({ panel }: { panel: DatosPanelImagenes }) {
    const [generalAbierto, setGeneralAbierto] = useState(true);
    const [varianteAbierto, setVarianteAbierto] = useState(panel.atributoFijo);
    const [valoresAbiertos, setValoresAbiertos] = useState<ReadonlySet<number>>(new Set());
    const totalPorValor = panel.valores.reduce((suma, v) => suma + v.imagenes.length, 0);
    const nombreAtributo = panel.atributos.find((a) => a.idAtributo === panel.idAtributo)?.nombre;

    return (
        <Tarjeta className={estilos.bloque}>
            <h2>Imágenes</h2>
            <p className={estilos.ayuda}>{panel.ayuda}</p>
            {panel.aviso && <Alerta tipo="aviso">{panel.aviso}</Alerta>}
            <div className={estilos.gruposVariantes}>
                <GrupoPlegable
                    titulo="Generales"
                    detalle={`Para todas las variantes · ${contar(panel.general.length)}`}
                    abierto={generalAbierto}
                    alAlternar={() => {
                        setGeneralAbierto(!generalAbierto);
                    }}
                >
                    <div className={estilos.cuerpoImagenes}>
                        <Grupo panel={panel} idValor={null} titulo="generales" imagenes={panel.general} />
                    </div>
                </GrupoPlegable>
                {panel.atributos.length > 0 && (
                    <GrupoPlegable
                        titulo="Por variante"
                        detalle={`${nombreAtributo ?? ''} · ${contar(totalPorValor)}`}
                        abierto={varianteAbierto}
                        alAlternar={() => {
                            setVarianteAbierto(!varianteAbierto);
                        }}
                    >
                        <div className={estilos.cuerpoImagenes}>
                            {panel.atributos.length > 1 && (
                                <Selector
                                    etiqueta="Agrupar por"
                                    valor={String(panel.idAtributo)}
                                    opciones={panel.atributos.map((a) => ({
                                        valor: String(a.idAtributo),
                                        etiqueta: a.nombre,
                                    }))}
                                    disabled={panel.atributoFijo}
                                    ayuda={
                                        panel.atributoFijo
                                            ? 'Para cambiarlo, quita primero las imágenes por variante.'
                                            : 'Todas las imágenes por variante usan un solo atributo.'
                                    }
                                    alCambiar={(valor) => {
                                        panel.elegirAtributo(Number(valor));
                                    }}
                                />
                            )}
                            {panel.valores.length === 0 && <p className={estilos.ayuda}>{panel.sinValores}</p>}
                            <div className={estilos.gruposVariantes}>
                                {panel.valores.map((v) => (
                                    <GrupoPlegable
                                        key={v.idValor}
                                        titulo={v.titulo}
                                        detalle={contar(v.imagenes.length)}
                                        abierto={valoresAbiertos.has(v.idValor)}
                                        alAlternar={() => {
                                            setValoresAbiertos((actuales) => {
                                                const copia = new Set(actuales);
                                                if (!copia.delete(v.idValor)) copia.add(v.idValor);
                                                return copia;
                                            });
                                        }}
                                    >
                                        <div className={estilos.cuerpoImagenes}>
                                            <Grupo
                                                panel={panel}
                                                idValor={v.idValor}
                                                titulo={v.titulo}
                                                imagenes={v.imagenes}
                                            />
                                        </div>
                                    </GrupoPlegable>
                                ))}
                            </div>
                        </div>
                    </GrupoPlegable>
                )}
            </div>
        </Tarjeta>
    );
}
