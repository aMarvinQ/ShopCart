import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { esErrorApi } from '../../../api/errores';
import { useSesion } from '../../../sesion/contexto';
import { inicioDe } from '../../../sesion/permisos';
import { aplicarErroresApi } from '../../../utils/formularios';
import { rutaInternaSegura } from '../../../utils/rutas';
import { esquemaApellido, esquemaContrasenaNueva, esquemaNombre, esquemaTelefono } from '../esquemas';

const esquemaIngreso = z.object({
    correo: z.email('Escribe un correo válido.'),
    contrasena: z.string().min(1, 'Escribe tu contraseña.'),
});
type DatosIngreso = z.infer<typeof esquemaIngreso>;

const esquemaRegistro = z.object({
    nombre: esquemaNombre,
    apellido: esquemaApellido,
    correo: z.email('Escribe un correo válido.'),
    telefono: esquemaTelefono,
    contrasena: esquemaContrasenaNueva,
});
type DatosRegistro = z.infer<typeof esquemaRegistro>;

function mensajeDeIngreso(error: unknown): string {
    if (!esErrorApi(error)) return 'No pudimos iniciar sesión; intenta de nuevo.';
    if (error.codigo === 'DEMASIADOS_INTENTOS' && error.reintentarEn) {
        const minutos = Math.ceil(error.reintentarEn / 60);
        return `Demasiados intentos; intenta de nuevo en ${String(minutos)} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
    }
    return error.message;
}

export function useIngreso() {
    const { usuario, sesionVencida, iniciarSesion } = useSesion();
    const navegar = useNavigate();
    const [parametros] = useSearchParams();
    const volver = rutaInternaSegura(parametros.get('volver'));
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<DatosIngreso>({ resolver: zodResolver(esquemaIngreso) });
    const enviando = formulario.formState.isSubmitting;

    return {
        formulario,
        enviando,
        errorGeneral,
        sesionVencida,
        /** Ya hay sesión y no se está enviando: la pantalla redirige aquí. */
        redirigirA: usuario && !enviando ? (volver ?? inicioDe(usuario.codigoRol)) : null,
        enviar: formulario.handleSubmit(async (datos) => {
            setErrorGeneral(null);
            try {
                const ingresado = await iniciarSesion(datos);
                await navegar(volver ?? inicioDe(ingresado.codigoRol), { replace: true });
            } catch (error) {
                setErrorGeneral(mensajeDeIngreso(error));
            }
        }),
    };
}

export function useRegistro() {
    const { usuario, registrarse } = useSesion();
    const navegar = useNavigate();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const formulario = useForm<DatosRegistro>({ resolver: zodResolver(esquemaRegistro) });
    const enviando = formulario.formState.isSubmitting;

    return {
        formulario,
        enviando,
        errorGeneral,
        redirigirA: usuario && !enviando ? inicioDe(usuario.codigoRol) : null,
        enviar: formulario.handleSubmit(async ({ telefono, ...datos }) => {
            setErrorGeneral(null);
            try {
                const nuevo = await registrarse({ ...datos, ...(telefono && { telefono }) });
                await navegar(inicioDe(nuevo.codigoRol), { replace: true });
            } catch (error) {
                setErrorGeneral(
                    aplicarErroresApi(
                        error,
                        formulario.setError,
                        ['nombre', 'apellido', 'correo', 'telefono', 'contrasena'],
                        'No pudimos crear tu cuenta; intenta de nuevo.',
                    ),
                );
            }
        }),
    };
}
