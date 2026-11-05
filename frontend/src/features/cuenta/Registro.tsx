import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import { useSesion } from '../../sesion/contexto';
import { inicioDe } from '../../sesion/permisos';
import { Boton } from '../../ui/Boton';
import { Campo, CampoContrasena } from '../../ui/Campo';
import { Alerta } from '../../ui/Mensajes';
import { aplicarErroresApi } from '../../utils/formularios';
import { MarcoAcceso } from './MarcoAcceso';
import estilos from './cuenta.module.scss';
import { AYUDA_CONTRASENA, esquemaApellido, esquemaContrasenaNueva, esquemaNombre, esquemaTelefono } from './esquemas';

const esquema = z.object({
    nombre: esquemaNombre,
    apellido: esquemaApellido,
    correo: z.email('Escribe un correo válido.'),
    telefono: esquemaTelefono,
    contrasena: esquemaContrasenaNueva,
});
type Datos = z.infer<typeof esquema>;

export default function Registro() {
    const { usuario, registrarse } = useSesion();
    const navegar = useNavigate();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors, isSubmitting },
    } = useForm<Datos>({ resolver: zodResolver(esquema) });

    if (usuario && !isSubmitting) return <Navigate to={inicioDe(usuario.codigoRol)} replace />;

    const enviar = async ({ telefono, ...datos }: Datos) => {
        setErrorGeneral(null);
        try {
            const nuevo = await registrarse({ ...datos, ...(telefono && { telefono }) });
            await navegar(inicioDe(nuevo.codigoRol), { replace: true });
        } catch (error) {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    setError,
                    ['nombre', 'apellido', 'correo', 'telefono', 'contrasena'],
                    'No pudimos crear tu cuenta; intenta de nuevo.',
                ),
            );
        }
    };

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
            <form onSubmit={(e) => void handleSubmit(enviar)(e)} noValidate className={estilos.formulario}>
                <div className={estilos.dosColumnas}>
                    <Campo
                        etiqueta="Nombre"
                        autoComplete="given-name"
                        error={errors.nombre?.message}
                        {...register('nombre')}
                    />
                    <Campo
                        etiqueta="Apellido"
                        autoComplete="family-name"
                        error={errors.apellido?.message}
                        {...register('apellido')}
                    />
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
                <Boton type="submit" anchoCompleto cargando={isSubmitting}>
                    Crear cuenta
                </Boton>
            </form>
        </MarcoAcceso>
    );
}
