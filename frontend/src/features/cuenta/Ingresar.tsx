import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { esErrorApi } from '../../api/errores';
import { useSesion } from '../../sesion/contexto';
import { inicioDe } from '../../sesion/permisos';
import { Boton } from '../../ui/Boton';
import { Campo, CampoContrasena } from '../../ui/Campo';
import { Alerta } from '../../ui/Mensajes';
import { rutaInternaSegura } from '../../utils/rutas';
import { MarcoAcceso } from './MarcoAcceso';
import estilos from './cuenta.module.scss';

const esquema = z.object({
    correo: z.email('Escribe un correo válido.'),
    contrasena: z.string().min(1, 'Escribe tu contraseña.'),
});
type Datos = z.infer<typeof esquema>;

function mensajeDe(error: unknown): string {
    if (!esErrorApi(error)) return 'No pudimos iniciar sesión; intenta de nuevo.';
    if (error.codigo === 'DEMASIADOS_INTENTOS' && error.reintentarEn) {
        const minutos = Math.ceil(error.reintentarEn / 60);
        return `Demasiados intentos; intenta de nuevo en ${String(minutos)} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
    }
    return error.message;
}

export default function Ingresar() {
    const { usuario, sesionVencida, iniciarSesion } = useSesion();
    const navegar = useNavigate();
    const [parametros] = useSearchParams();
    const volver = rutaInternaSegura(parametros.get('volver'));
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<Datos>({ resolver: zodResolver(esquema) });

    if (usuario && !isSubmitting) return <Navigate to={volver ?? inicioDe(usuario.codigoRol)} replace />;

    const enviar = async (datos: Datos) => {
        setErrorGeneral(null);
        try {
            const ingresado = await iniciarSesion(datos);
            await navegar(volver ?? inicioDe(ingresado.codigoRol), { replace: true });
        } catch (error) {
            setErrorGeneral(mensajeDe(error));
        }
    };

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
            <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className={estilos.formulario}>
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
                <Boton type="submit" anchoCompleto cargando={isSubmitting}>
                    Ingresar
                </Boton>
            </form>
        </MarcoAcceso>
    );
}
