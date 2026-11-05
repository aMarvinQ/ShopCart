import { MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { esErrorApi } from '../../api/errores';
import { Boton } from '../../ui/Boton';
import { Campo } from '../../ui/Campo';
import { Casilla } from '../../ui/Controles';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, Cajon, DialogoConfirmacion, EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { Selector } from '../../ui/Selector';
import { useDirecciones, useFormularioDireccion, type Direccion } from './hooks/useDirecciones';
import estilos from './cuenta.module.scss';

function FormularioDireccion({ direccion, alTerminar }: { direccion: Direccion | null; alTerminar: () => void }) {
    const { formulario, errorGeneral, guardando, departamento, municipio, enviar } = useFormularioDireccion(
        direccion,
        alTerminar,
    );
    const {
        register,
        formState: { errors },
    } = formulario;

    return (
        <form className={estilos.formulario} noValidate onSubmit={(e) => void enviar(e)}>
            {errorGeneral && (
                <div className={estilos.mensajes}>
                    <Alerta tipo="error">{errorGeneral}</Alerta>
                </div>
            )}
            <Campo
                etiqueta="Nombre de la dirección"
                placeholder="Casa"
                error={errors.alias?.message}
                {...register('alias')}
            />
            <Campo
                etiqueta="Quién recibe"
                autoComplete="name"
                error={errors.nombreDestinatario?.message}
                {...register('nombreDestinatario')}
            />
            <Campo
                etiqueta="Teléfono"
                type="tel"
                autoComplete="tel"
                error={errors.telefono?.message}
                {...register('telefono')}
            />
            <Campo
                etiqueta="Dirección"
                autoComplete="address-line1"
                error={errors.linea1?.message}
                {...register('linea1')}
            />
            <Campo
                etiqueta="Complemento (opcional)"
                autoComplete="address-line2"
                error={errors.linea2?.message}
                {...register('linea2')}
            />
            <div className="row gx-3">
                <div className="col-sm-6">
                    <Selector
                        etiqueta="Departamento"
                        valor={departamento.valor}
                        error={errors.idDepartamento?.message}
                        opciones={departamento.opciones}
                        alCambiar={departamento.alCambiar}
                        onBlur={departamento.onBlur}
                    />
                </div>
                <div className="col-sm-6">
                    <Selector
                        etiqueta="Municipio"
                        valor={municipio.valor}
                        error={errors.idMunicipio?.message}
                        disabled={departamento.valor === ''}
                        opciones={municipio.opciones}
                        alCambiar={municipio.alCambiar}
                        onBlur={municipio.onBlur}
                    />
                </div>
            </div>
            <Campo
                etiqueta="Código postal (opcional)"
                inputMode="numeric"
                autoComplete="postal-code"
                error={errors.codigoPostal?.message}
                {...register('codigoPostal')}
            />
            <Campo etiqueta="Referencias (opcional)" error={errors.referencias?.message} {...register('referencias')} />
            {!direccion && <Casilla etiqueta="Usar como predeterminada" {...register('esPredeterminada')} />}
            <Boton type="submit" anchoCompleto cargando={guardando}>
                Guardar dirección
            </Boton>
        </form>
    );
}

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
                        alTerminar={libreta.cerrarCajon}
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
