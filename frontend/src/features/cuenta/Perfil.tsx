import { esErrorApi } from '../../api/errores';
import { Boton } from '../../ui/Boton';
import { Campo, CampoContrasena } from '../../ui/Campo';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, EstadoError } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { AYUDA_CONTRASENA } from './esquemas';
import { useFormularioContrasena, useFormularioPerfil, usePerfil, type DatosPerfil } from './hooks/usePerfil';
import estilos from './cuenta.module.scss';

function FormularioDatos({ perfil }: { perfil: DatosPerfil }) {
    const { formulario, errorGeneral, guardando, enviar } = useFormularioPerfil(perfil);
    const {
        register,
        formState: { errors },
    } = formulario;

    return (
        <Tarjeta className={estilos.bloque}>
            <h2 className={estilos.bloqueTitulo} data-testid="perfil-nombre">
                {perfil.nombre} {perfil.apellido}
            </h2>
            {errorGeneral && (
                <div className={estilos.mensajes}>
                    <Alerta tipo="error">{errorGeneral}</Alerta>
                </div>
            )}
            <form onSubmit={(e) => void enviar(e)} noValidate className={estilos.formulario}>
                <div className="row gx-3">
                    <div className="col-sm-6">
                        <Campo
                            etiqueta="Nombre"
                            autoComplete="given-name"
                            error={errors.nombre?.message}
                            {...register('nombre')}
                        />
                    </div>
                    <div className="col-sm-6">
                        <Campo
                            etiqueta="Apellido"
                            autoComplete="family-name"
                            error={errors.apellido?.message}
                            {...register('apellido')}
                        />
                    </div>
                    <div className="col-sm-6">
                        <Campo
                            etiqueta="Correo electrónico"
                            value={perfil.correo}
                            disabled
                            ayuda="El correo identifica tu cuenta y no se puede cambiar."
                        />
                    </div>
                    <div className="col-sm-6">
                        <Campo
                            etiqueta="Teléfono (opcional)"
                            type="tel"
                            autoComplete="tel"
                            error={errors.telefono?.message}
                            {...register('telefono')}
                        />
                    </div>
                </div>
                <div className={estilos.acciones}>
                    <Boton type="submit" cargando={guardando}>
                        Guardar cambios
                    </Boton>
                </div>
            </form>
        </Tarjeta>
    );
}

function FormularioContrasena() {
    const { formulario, errorGeneral, cambiando, enviar } = useFormularioContrasena();
    const {
        register,
        formState: { errors },
    } = formulario;

    return (
        <Tarjeta className={estilos.bloque}>
            <h2 className={estilos.bloqueTitulo}>Cambiar contraseña</h2>
            {errorGeneral && (
                <div className={estilos.mensajes}>
                    <Alerta tipo="error">{errorGeneral}</Alerta>
                </div>
            )}
            <form onSubmit={(e) => void enviar(e)} noValidate className={estilos.formulario}>
                <div className="row gx-3">
                    <div className="col-sm-6">
                        <CampoContrasena
                            etiqueta="Contraseña actual"
                            autoComplete="current-password"
                            error={errors.contrasenaActual?.message}
                            {...register('contrasenaActual')}
                        />
                    </div>
                    <div className="col-sm-6">
                        <CampoContrasena
                            etiqueta="Contraseña nueva"
                            autoComplete="new-password"
                            ayuda={AYUDA_CONTRASENA}
                            error={errors.contrasenaNueva?.message}
                            {...register('contrasenaNueva')}
                        />
                    </div>
                </div>
                <div className={estilos.acciones}>
                    <Boton type="submit" variante="secundario" cargando={cambiando}>
                        Cambiar contraseña
                    </Boton>
                </div>
            </form>
        </Tarjeta>
    );
}

function EsqueletoPerfil() {
    return (
        <Tarjeta className={estilos.bloque}>
            <div role="status" aria-label="Cargando perfil">
                <Esqueleto ancho="12rem" alto="1.5rem" />
                <div className="row g-3 mt-2">
                    {Array.from({ length: 4 }, (_, i) => (
                        <div key={i} className="col-sm-6">
                            <Esqueleto alto="2.75rem" />
                        </div>
                    ))}
                </div>
            </div>
        </Tarjeta>
    );
}

export default function Perfil() {
    const consulta = usePerfil();

    return (
        <section className={estilos.perfil}>
            <title>Perfil · ShopCart</title>
            <h1 className={estilos.titulo}>Perfil y contraseña</h1>
            {consulta.isPending && <EsqueletoPerfil />}
            {consulta.isError && (
                <Tarjeta>
                    <EstadoError
                        titulo="No pudimos cargar tu perfil"
                        mensaje={consulta.error.message}
                        referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                        alReintentar={() => void consulta.refetch()}
                    />
                </Tarjeta>
            )}
            {consulta.isSuccess && (
                <>
                    <FormularioDatos perfil={consulta.data.data} />
                    <FormularioContrasena />
                </>
            )}
        </section>
    );
}
