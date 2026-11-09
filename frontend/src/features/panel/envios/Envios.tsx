import { Pencil, Plus, Truck } from 'lucide-react';
import { useState } from 'react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { Interruptor } from '../../../ui/Controles';
import { Esqueleto } from '../../../ui/Esqueleto';
import { Alerta, Cajon, EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { moneda } from '../../../utils/formato';
import { textoPlazo } from '../../tienda/textos';
import { FormularioMetodo } from './FormularioMetodo';
import { useMetodosEnvio, type MetodoEnvio } from './hooks/useMetodosEnvio';
import estilos from './envios.module.scss';

function TarjetaMetodo({
    metodo,
    ultimoActivo,
    cambiando,
    alAlternar,
    alEditar,
}: {
    metodo: MetodoEnvio;
    ultimoActivo: boolean;
    cambiando: boolean;
    alAlternar: () => void;
    alEditar: () => void;
}) {
    return (
        <article className={estilos.tarjeta}>
            <div className={estilos.cabecera}>
                <span className={estilos.icono} aria-hidden="true">
                    <Truck size={20} />
                </span>
                <div className={estilos.nombre}>
                    <h2>{metodo.nombre}</h2>
                    {metodo.descripcion && <p>{metodo.descripcion}</p>}
                </div>
            </div>
            <dl className={estilos.datos}>
                <div>
                    <dt>Costo</dt>
                    <dd className={`numero ${estilos.costo}`}>
                        {metodo.costo === 0 ? 'Gratis' : moneda(metodo.costo)}
                    </dd>
                </div>
                <div>
                    <dt>Entrega estimada</dt>
                    <dd>{textoPlazo(metodo.diasEstimadosMin, metodo.diasEstimadosMax)}</dd>
                </div>
            </dl>
            <div className={estilos.estado}>
                <Interruptor
                    etiqueta={metodo.activo ? 'Activo' : 'Inactivo'}
                    aria-label={`Activo: ${metodo.nombre}`}
                    checked={metodo.activo}
                    disabled={cambiando || ultimoActivo}
                    onChange={alAlternar}
                />
                {ultimoActivo && <small>Único activo: no se puede desactivar.</small>}
            </div>
            <div className={estilos.editar}>
                <Boton variante="secundario" icono={Pencil} aria-label={`Editar ${metodo.nombre}`} onClick={alEditar}>
                    Editar
                </Boton>
            </div>
        </article>
    );
}

function Cargando() {
    return (
        <div role="status" aria-label="Cargando métodos de envío" className={estilos.cuadricula}>
            {[0, 1, 2].map((i) => (
                <div key={i} className={estilos.tarjeta}>
                    <div className={estilos.cabecera}>
                        <Esqueleto ancho="2.5rem" alto="2.5rem" radio="8px" />
                        <Esqueleto ancho="60%" alto="1.25rem" />
                    </div>
                    <div className={estilos.datos}>
                        <Esqueleto alto="2.75rem" />
                        <Esqueleto alto="2.75rem" />
                    </div>
                    <Esqueleto ancho="6rem" alto="1.5rem" radio="999px" />
                </div>
            ))}
        </div>
    );
}

export default function Envios() {
    const { consulta, metodos, activos, cambiando, esUltimoActivo, alternar } = useMetodosEnvio();
    /* undefined: cerrado; null: método nuevo; número: editando ese método. */
    const [edicion, setEdicion] = useState<number | null | undefined>(undefined);
    const nuevo = () => {
        setEdicion(null);
    };

    let contenido;
    if (consulta.isPending) contenido = <Cargando />;
    else if (consulta.isError) {
        contenido = (
            <div className={estilos.marco}>
                <EstadoError
                    titulo="No pudimos cargar los métodos de envío"
                    mensaje="La tienda sigue usando la última configuración guardada."
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            </div>
        );
    } else if (metodos?.length === 0) {
        contenido = (
            <div className={estilos.marco}>
                <EstadoVacio
                    icono={Truck}
                    titulo="Aún no hay métodos de envío"
                    mensaje="Sin al menos uno activo, los clientes no pueden terminar su compra. Empieza con envío estándar o recoger en tienda."
                    accion={
                        <Boton icono={Plus} onClick={nuevo}>
                            Crear método de envío
                        </Boton>
                    }
                />
            </div>
        );
    } else {
        contenido = (
            <>
                <Alerta tipo="informacion">
                    Los métodos no se eliminan, porque los pedidos los conservan. El último activo no se puede
                    desactivar, y un costo nuevo solo aplica a compras nuevas.
                </Alerta>
                <div className={estilos.cuadricula}>
                    {metodos?.map((m) => (
                        <TarjetaMetodo
                            key={m.idMetodoEnvio}
                            metodo={m}
                            ultimoActivo={esUltimoActivo(m)}
                            cambiando={cambiando}
                            alAlternar={() => {
                                alternar(m);
                            }}
                            alEditar={() => {
                                setEdicion(m.idMetodoEnvio);
                            }}
                        />
                    ))}
                </div>
            </>
        );
    }

    return (
        <section className={estilos.pagina}>
            <title>Métodos de envío · ShopCart</title>
            <div className={estilos.encabezado}>
                <div>
                    <h1 className={estilos.titulo}>Métodos de envío</h1>
                    <p className={estilos.subtitulo}>
                        {metodos && metodos.length > 0 && (
                            <strong>
                                {metodos.length} {metodos.length === 1 ? 'método' : 'métodos'} · {activos}{' '}
                                {activos === 1 ? 'activo' : 'activos'}.{' '}
                            </strong>
                        )}
                        Lo que el cliente ve al pagar.
                    </p>
                </div>
                <div className={estilos.nuevo}>
                    <Boton icono={Plus} onClick={nuevo}>
                        Nuevo método
                    </Boton>
                </div>
            </div>
            {contenido}
            <Cajon
                mostrar={edicion !== undefined}
                titulo={
                    edicion === null
                        ? 'Nuevo método de envío'
                        : `Editar método: ${metodos?.find((m) => m.idMetodoEnvio === edicion)?.nombre ?? ''}`
                }
                alCerrar={() => {
                    setEdicion(undefined);
                }}
            >
                {edicion !== undefined && (
                    <FormularioMetodo
                        key={String(edicion)}
                        id={edicion}
                        alTerminar={() => {
                            setEdicion(undefined);
                        }}
                    />
                )}
            </Cajon>
        </section>
    );
}
