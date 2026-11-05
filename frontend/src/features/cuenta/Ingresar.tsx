import { Link, Navigate } from 'react-router';
import { Boton } from '../../ui/Boton';
import { Campo, CampoContrasena } from '../../ui/Campo';
import { Alerta } from '../../ui/Mensajes';
import { useIngreso } from './hooks/useAcceso';
import { MarcoAcceso } from './MarcoAcceso';
import estilos from './cuenta.module.scss';

export default function Ingresar() {
    const { formulario, enviando, errorGeneral, sesionVencida, redirigirA, enviar } = useIngreso();
    const {
        register,
        formState: { errors },
    } = formulario;

    if (redirigirA) return <Navigate to={redirigirA} replace />;

    return (
        <MarcoAcceso
            titulo="Ingresar"
            subtitulo="Entra con tu correo y contraseña."
            pie={
                <>
                    ¿No tienes cuenta? <Link to="/registro">Crear una cuenta</Link>
                </>
            }
        >
            {(errorGeneral ?? sesionVencida) && (
                <div className={estilos.mensajes}>
                    {errorGeneral ? (
                        <Alerta tipo="error">{errorGeneral}</Alerta>
                    ) : (
                        <Alerta tipo="informacion">Tu sesión terminó; ingresa de nuevo.</Alerta>
                    )}
                </div>
            )}
            <form onSubmit={(e) => void enviar(e)} noValidate className={estilos.formulario}>
                <Campo
                    etiqueta="Correo electrónico"
                    type="email"
                    autoComplete="username"
                    error={errors.correo?.message}
                    {...register('correo')}
                />
                <CampoContrasena
                    etiqueta="Contraseña"
                    autoComplete="current-password"
                    error={errors.contrasena?.message}
                    {...register('contrasena')}
                />
                <Boton type="submit" anchoCompleto cargando={enviando}>
                    Ingresar
                </Boton>
            </form>
        </MarcoAcceso>
    );
}
