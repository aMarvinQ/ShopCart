import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { esErrorApi } from '../../api/errores';
import { useSesion } from '../../sesion/contexto';
import { inicioDe } from '../../sesion/permisos';
import { rutaInternaSegura } from '../../utils/rutas';

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

/* Ingreso. Su aspecto final llega con los componentes del sistema de diseño. */
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
        <section className="row justify-content-center">
            <title>Ingresar · ShopCart</title>
            <div className="col-12 col-sm-10 col-md-7 col-lg-5">
                <h1 className="h3 mb-3">Ingresar</h1>
                {sesionVencida && !errorGeneral && (
                    <div className="alert alert-info" role="status">
                        Tu sesión terminó; ingresa de nuevo.
                    </div>
                )}
                {errorGeneral && (
                    <div className="alert alert-danger" role="alert">
                        {errorGeneral}
                    </div>
                )}
                <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className="card card-body">
                    <div className="mb-3">
                        <label htmlFor="correo" className="form-label">
                            Correo electrónico
                        </label>
                        <input
                            id="correo"
                            type="email"
                            autoComplete="username"
                            className={`form-control ${errors.correo ? 'is-invalid' : ''}`}
                            aria-invalid={Boolean(errors.correo)}
                            aria-describedby={errors.correo ? 'correo-error' : undefined}
                            {...register('correo')}
                        />
                        {errors.correo && (
                            <div id="correo-error" className="invalid-feedback">
                                {errors.correo.message}
                            </div>
                        )}
                    </div>
                    <div className="mb-3">
                        <label htmlFor="contrasena" className="form-label">
                            Contraseña
                        </label>
                        <input
                            id="contrasena"
                            type="password"
                            autoComplete="current-password"
                            className={`form-control ${errors.contrasena ? 'is-invalid' : ''}`}
                            aria-invalid={Boolean(errors.contrasena)}
                            aria-describedby={errors.contrasena ? 'contrasena-error' : undefined}
                            {...register('contrasena')}
                        />
                        {errors.contrasena && (
                            <div id="contrasena-error" className="invalid-feedback">
                                {errors.contrasena.message}
                            </div>
                        )}
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
                    </button>
                </form>
                <p className="mt-3 text-center">
                    ¿No tienes cuenta? <Link to="/registro">Crear una cuenta</Link>
                </p>
            </div>
        </section>
    );
}
