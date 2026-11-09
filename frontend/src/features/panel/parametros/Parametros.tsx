import { SlidersHorizontal } from 'lucide-react';
import { esErrorApi } from '../../../api/errores';
import { Boton } from '../../../ui/Boton';
import { CampoBusqueda } from '../../../ui/Campo';
import { Esqueleto } from '../../../ui/Esqueleto';
import { EstadoError, EstadoVacio } from '../../../ui/Mensajes';
import { useParametros } from './hooks/useParametros';
import { TarjetaParametro } from './TarjetaParametro';
import estilos from './parametros.module.scss';

function Cargando() {
    return (
        <div role="status" aria-label="Cargando parámetros" className={estilos.lista}>
            {[0, 1, 2, 3].map((i) => (
                <div key={i} className={estilos.tarjeta}>
                    <div className={estilos.info}>
                        <Esqueleto ancho="45%" alto="1.25rem" />
                        <Esqueleto ancho="80%" />
                        <Esqueleto ancho="55%" />
                    </div>
                    <div className={estilos.edicion}>
                        <Esqueleto alto="2.75rem" radio="8px" />
                        <Esqueleto ancho="60%" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function Parametros() {
    const { consulta, visibles, opcionesGrupo, busqueda, grupo, setBusqueda, setGrupo, limpiar } = useParametros();

    let contenido;
    if (consulta.isPending) contenido = <Cargando />;
    else if (consulta.isError) {
        contenido = (
            <div className={estilos.marco}>
                <EstadoError
                    titulo="No pudimos cargar los parámetros"
                    mensaje="La tienda sigue usando los valores guardados."
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            </div>
        );
    } else if (visibles.length === 0) {
        contenido = (
            <div className={estilos.marco}>
                <EstadoVacio
                    icono={SlidersHorizontal}
                    titulo={
                        busqueda ? `Ningún parámetro coincide con “${busqueda}”` : 'No hay parámetros en este grupo'
                    }
                    mensaje="Prueba con otra palabra o quita el filtro de grupo."
                    accion={
                        <Boton variante="secundario" tamano="sm" onClick={limpiar}>
                            Limpiar búsqueda
                        </Boton>
                    }
                />
            </div>
        );
    } else {
        contenido = (
            <div className={estilos.lista}>
                {visibles.map(({ parametro, titulo, grupo: suGrupo, unidad, nota }) => (
                    <TarjetaParametro
                        key={parametro.clave}
                        parametro={parametro}
                        titulo={titulo}
                        grupo={suGrupo}
                        unidad={unidad}
                        nota={nota}
                    />
                ))}
            </div>
        );
    }

    return (
        <section className={estilos.pagina}>
            <title>Parámetros · ShopCart</title>
            <h1 className={estilos.titulo}>Parámetros del sistema</h1>
            <div className={estilos.filtros}>
                <div className={estilos.buscador}>
                    <CampoBusqueda
                        etiqueta="Buscar parámetro"
                        compacto
                        placeholder="Buscar parámetro"
                        value={busqueda}
                        onChange={({ target }) => {
                            setBusqueda(target.value);
                        }}
                    />
                </div>
                <div className={estilos.grupos} role="group" aria-label="Grupo">
                    {opcionesGrupo.map((opcion) => (
                        <button
                            key={opcion.etiqueta}
                            type="button"
                            aria-pressed={grupo === opcion.valor}
                            className={estilos.opcionGrupo}
                            onClick={() => {
                                setGrupo(opcion.valor);
                            }}
                        >
                            {opcion.etiqueta}
                        </button>
                    ))}
                </div>
            </div>
            <p className={estilos.nota}>
                Cada parámetro se guarda por separado y queda en la bitácora. Los cambios aplican de inmediato a los
                pedidos y sesiones nuevos.
            </p>
            {contenido}
        </section>
    );
}
