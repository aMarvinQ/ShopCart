import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { esErrorApi } from '../../api/errores';
import { Boton } from '../../ui/Boton';
import { Esqueleto } from '../../ui/Esqueleto';
import { Cajon, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { FormularioDireccion } from './FormularioDireccion';
import { useDirecciones } from './hooks/useDirecciones';
import estilos from './cuenta.module.scss';

export default function Direcciones() {
    const libreta = useDirecciones();
    const { consulta, cajon, porEliminar } = libreta;
    const lista = consulta.data?.data;

    return (
        <section className={estilos.perfil}>
            <title>Direcciones · ShopCart</title>
            <div className={estilos.encabezado}>
                <h1 className={estilos.titulo}>Direcciones</h1>
                <Boton
                    icono={Plus}
                    onClick={() => {
                        libreta.abrirCajon(null);
                    }}
                >
                    Agregar dirección
                </Boton>
            </div>
            {consulta.isPending && (
                <div role="status" aria-label="Cargando direcciones" className={estilos.direcciones}>
                    {Array.from({ length: 2 }, (_, i) => (
                        <Tarjeta key={i} className={estilos.direccion}>
                            <Esqueleto ancho="40%" alto="1.25rem" />
                            <Esqueleto alto="4rem" />
                        </Tarjeta>
                    ))}
                </div>
            )}
            {consulta.isError && (
                <Tarjeta>
                    <EstadoError
                        titulo="No pudimos cargar tus direcciones"
                        mensaje={consulta.error.message}
                        referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                        alReintentar={() => void consulta.refetch()}
                    />
                </Tarjeta>
            )}
            {lista?.length === 0 && (
                <Tarjeta>
                    <EstadoVacio
                        icono={MapPin}
                        titulo="Aún no tienes direcciones"
                        mensaje="Guárdalas aquí para comprar más rápido."
                    />
                </Tarjeta>
            )}
            {lista && lista.length > 0 && (
                <ul className={estilos.direcciones}>
                    {lista.map((d) => (
                        <li key={d.idDireccion}>
                            <Tarjeta className={estilos.direccion}>
                                <h2 className={estilos.bloqueTitulo}>
                                    {d.alias}
                                    {d.esPredeterminada && (
                                        <span className={`badge rounded-pill ${estilos.predeterminada}`}>
                                            Predeterminada
                                        </span>
                                    )}
                                </h2>
                                <address>
                                    {d.nombreDestinatario} · {d.telefono}
                                    <br />
                                    {d.linea1}
                                    {d.linea2 && `, ${d.linea2}`}
                                    <br />
                                    {d.municipio}, {d.departamento}
                                    {d.codigoPostal && ` · ${d.codigoPostal}`}
                                    {d.referencias && (
                                        <>
                                            <br />
                                            {d.referencias}
                                        </>
                                    )}
                                </address>
                                <div className={estilos.direccionAcciones}>
                                    <Boton
                                        variante="fantasma"
                                        tamano="sm"
                                        icono={Pencil}
                                        onClick={() => {
                                            libreta.abrirCajon(d);
                                        }}
                                    >
                                        Editar
                                    </Boton>
                                    {!d.esPredeterminada && (
                                        <Boton
                                            variante="fantasma"
                                            tamano="sm"
                                            icono={Star}
                                            cargando={libreta.predeterminando === d.idDireccion}
                                            onClick={() => {
                                                libreta.predeterminar(d.idDireccion);
                                            }}
                                        >
                                            Predeterminar
                                        </Boton>
                                    )}
                                    <Boton
                                        variante="fantasma"
                                        tamano="sm"
                                        icono={Trash2}
                                        onClick={() => {
                                            libreta.pedirEliminar(d);
                                        }}
                                    >
                                        Eliminar
                                    </Boton>
                                </div>
                            </Tarjeta>
                        </li>
                    ))}
                </ul>
            )}
            <Cajon
                mostrar={cajon !== null}
                titulo={cajon?.direccion ? 'Editar dirección' : 'Agregar dirección'}
                alCerrar={libreta.cerrarCajon}
            >
                {cajon && (
                    <FormularioDireccion
                        key={cajon.direccion?.idDireccion ?? 'nueva'}
                        direccion={cajon.direccion}
                        alGuardar={libreta.cerrarCajon}
                    />
                )}
            </Cajon>
            <DialogoConfirmacion
                mostrar={porEliminar !== null}
                titulo={`¿Eliminar la dirección ${porEliminar?.alias ?? ''}?`}
                textoConfirmar="Sí, eliminar"
                cargando={libreta.eliminando}
                alCancelar={libreta.cancelarEliminar}
                alConfirmar={libreta.confirmarEliminar}
            >
                Los pedidos ya realizados conservan su dirección.
            </DialogoConfirmacion>
        </section>
    );
}
