import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api, type DatosDe } from '../../api/cliente';
import { esErrorApi } from '../../api/errores';
import { useSesion } from '../../sesion/contexto';
import { useAvisos } from '../../ui/avisos/contexto';
import { Boton } from '../../ui/Boton';
import { Campo, CampoContrasena } from '../../ui/Campo';
import { Esqueleto } from '../../ui/Esqueleto';
import { Alerta, EstadoError } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { aplicarErroresApi } from '../../utils/formularios';
import estilos from './cuenta.module.scss';
import { AYUDA_CONTRASENA, esquemaApellido, esquemaContrasenaNueva, esquemaNombre, esquemaTelefono } from './esquemas';

const esquemaDatos = z.object({ nombre: esquemaNombre, apellido: esquemaApellido, telefono: esquemaTelefono });
type Datos = z.infer<typeof esquemaDatos>;

const esquemaClave = z.object({
    contrasenaActual: z.string().min(1, 'Escribe tu contraseña actual.'),
    contrasenaNueva: esquemaContrasenaNueva,
});
type Clave = z.infer<typeof esquemaClave>;

function FormularioDatos({ perfil }: { perfil: DatosDe<'get', '/perfil'> }) {
    const { actualizarNombre } = useSesion();
    const consultas = useQueryClient();
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        setError,
        formState: { errors },
    } = useForm<Datos>({
        resolver: zodResolver(esquemaDatos),
        defaultValues: { nombre: perfil.nombre, apellido: perfil.apellido, telefono: perfil.telefono ?? '' },
    });
    const guardar = useMutation({
        mutationFn: ({ nombre, apellido, telefono }: Datos) =>
            api.put('/perfil', { cuerpo: { nombre, apellido, telefono: telefono || null } }),
        onSuccess: ({ data }) => {
            setErrorGeneral(null);
            consultas.setQueryData(['perfil'], { data });
            actualizarNombre(data.nombre, data.apellido);
            avisar({ tipo: 'exito', titulo: 'Perfil actualizado' });
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    setError,
                    ['nombre', 'apellido', 'telefono'],
                    'No pudimos guardar los cambios; intenta de nuevo.',
                ),
            );
        },
    });

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
            <form
                onSubmit={(e) =>
                    void handleSubmit((datos) => {
                        guardar.mutate(datos);
                    })(e)
                }
                noValidate
                className={estilos.formulario}
            >
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
                    <Campo
                        etiqueta="Correo electrónico"
                        value={perfil.correo}
                        disabled
                        ayuda="El correo identifica tu cuenta y no se puede cambiar."
                    />
                    <Campo
                        etiqueta="Teléfono (opcional)"
                        type="tel"
                        autoComplete="tel"
                        error={errors.telefono?.message}
                        {...register('telefono')}
                    />
                </div>
                <div className={estilos.acciones}>
                    <Boton type="submit" cargando={guardar.isPending}>
                        Guardar cambios
                    </Boton>
                </div>
            </form>
        </Tarjeta>
    );
}

function FormularioContrasena() {
    const avisar = useAvisos();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const {
        register,
        handleSubmit,
        setError,
        reset,
        formState: { errors },
    } = useForm<Clave>({ resolver: zodResolver(esquemaClave) });
    const cambiar = useMutation({
        mutationFn: (datos: Clave) => api.post('/auth/cambiar-contrasena', { cuerpo: datos }),
        onSuccess: ({ data }) => {
            setErrorGeneral(null);
            reset();
            avisar({
                tipo: 'exito',
                titulo: 'Contraseña actualizada',
                ...(data.sesionesCerradas > 0 && { detalle: 'Cerramos tu sesión en los demás dispositivos.' }),
            });
        },
        onError: (error) => {
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    setError,
                    ['contrasenaActual', 'contrasenaNueva'],
                    'No pudimos cambiar la contraseña; intenta de nuevo.',
                ),
            );
        },
    });

    return (
        <Tarjeta className={estilos.bloque}>
            <h2 className={estilos.bloqueTitulo}>Cambiar contraseña</h2>
            {errorGeneral && (
                <div className={estilos.mensajes}>
                    <Alerta tipo="error">{errorGeneral}</Alerta>
                </div>
            )}
            <form
                onSubmit={(e) =>
                    void handleSubmit((datos) => {
                        cambiar.mutate(datos);
                    })(e)
                }
                noValidate
                className={estilos.formulario}
            >
                <div className={estilos.dosColumnas}>
                    <CampoContrasena
                        etiqueta="Contraseña actual"
                        autoComplete="current-password"
                        error={errors.contrasenaActual?.message}
                        {...register('contrasenaActual')}
                    />
                    <CampoContrasena
                        etiqueta="Contraseña nueva"
                        autoComplete="new-password"
                        ayuda={AYUDA_CONTRASENA}
                        error={errors.contrasenaNueva?.message}
                        {...register('contrasenaNueva')}
                    />
                </div>
                <div className={estilos.acciones}>
                    <Boton type="submit" variante="secundario" cargando={cambiar.isPending}>
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
                <div className={estilos.dosColumnas} style={{ marginTop: '1.5rem' }}>
                    {Array.from({ length: 4 }, (_, i) => (
                        <Esqueleto key={i} alto="2.75rem" />
                    ))}
                </div>
            </div>
        </Tarjeta>
    );
}

export default function Perfil() {
    const consulta = useQuery({
        queryKey: ['perfil'],
        queryFn: ({ signal }) => api.get('/perfil', { signal }),
    });

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
