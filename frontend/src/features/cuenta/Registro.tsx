import { Link, Navigate } from 'react-router';
import { Boton } from '../../ui/Boton';
import { Campo, CampoContrasena } from '../../ui/Campo';
import { Alerta } from '../../ui/Mensajes';
import { AYUDA_CONTRASENA } from './esquemas';
import { useRegistro } from './hooks/useAcceso';
import { MarcoAcceso } from './MarcoAcceso';
import estilos from './cuenta.module.scss';

export default function Registro() {
    const { formulario, enviando, errorGeneral, redirigirA, enviar } = useRegistro();
    const {
        register,
        formState: { errors },
    } = formulario;

    if (redirigirA) return <Navigate to={redirigirA} replace />;

    return (
        <MarcoAcceso
            titulo="Crear cuenta"
            subtitulo="Guarda tus direcciones y sigue tus pedidos."
            pie={
                <>
                    ¿Ya tienes cuenta? <Link to="/ingresar">Ingresar</Link>
                </>
            }
        >
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
                </div>
                <Campo
                    etiqueta="Correo electrónico"
                    type="email"
                    autoComplete="username"
                    error={errors.correo?.message}
                    {...register('correo')}
                />
                <Campo
                    etiqueta="Teléfono (opcional)"
                    type="tel"
                    autoComplete="tel"
                    error={errors.telefono?.message}
                    {...register('telefono')}
                />
                <CampoContrasena
                    etiqueta="Contraseña"
                    autoComplete="new-password"
                    ayuda={AYUDA_CONTRASENA}
                    error={errors.contrasena?.message}
                    {...register('contrasena')}
                />
                <Boton type="submit" anchoCompleto cargando={enviando}>
                    Crear cuenta
                </Boton>
            </form>
        </MarcoAcceso>
    );
}
