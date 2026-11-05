import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/cliente';
import { esErrorApi } from '../api/errores';
import { EstadoError } from '../ui/Mensajes';
import { EsqueletoApp } from '../ui/Esqueleto';
import { ContextoSesion, type DatosIngreso, type DatosRegistro, type EstadoSesion, type ValorSesion } from './contexto';
import { renovarSesion, type Sesion, type UsuarioSesion } from './renovacion';
import { alTerminarSesion, fijarToken, huboSesion, marcarSesion } from './token';

/*
    Dueño de la sesión. Al abrir la app recupera la sesión con la cookie, sin pedir contraseña.
    Mientras tanto no se monta ninguna pantalla: así ninguna petición sale como invitado antes de
    saber quién es el usuario (el carrito sería el equivocado).

    Al cerrar sesión, o si termina sola, se vacía el caché de datos: el siguiente usuario del mismo
    navegador no ve nada del anterior. Las pestañas se avisan entre sí con un BroadcastChannel que
    no lleva datos, solo el evento.
*/
const CANAL = 'shopcart-sesion';
type Mensaje = 'inicio' | 'cierre';

export function ProveedorSesion({ children }: { children: ReactNode }) {
    const consultas = useQueryClient();
    const [estado, setEstado] = useState<EstadoSesion>(() => (huboSesion() ? 'cargando' : 'anonimo'));
    const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
    const [sesionVencida, setSesionVencida] = useState(false);
    const canal = useRef<BroadcastChannel | null>(null);

    const limpiar = useCallback(() => {
        fijarToken(null);
        marcarSesion(false);
        setUsuario(null);
        setEstado('anonimo');
        consultas.clear();
    }, [consultas]);

    const recuperar = useCallback(async () => {
        setEstado('cargando');
        try {
            const sesion = await renovarSesion();
            setUsuario(sesion?.usuario ?? null);
            setEstado(sesion ? 'autenticado' : 'anonimo');
        } catch (error) {
            if (!esErrorApi(error)) throw error;
            setEstado('sin-servicio');
        }
    }, []);

    useEffect(() => {
        if (huboSesion()) void recuperar();
    }, [recuperar]);

    // La API rechazó la renovación mientras se usaba la app.
    useEffect(
        () =>
            alTerminarSesion(() => {
                setSesionVencida(true);
                limpiar();
            }),
        [limpiar],
    );

    // Lo que pasa en otra pestaña.
    useEffect(() => {
        if (!('BroadcastChannel' in globalThis)) return undefined;
        const nuevo = new BroadcastChannel(CANAL);
        nuevo.onmessage = ({ data }: MessageEvent<Mensaje>) => {
            if (data === 'cierre') limpiar();
            if (data === 'inicio') {
                consultas.clear();
                void recuperar();
            }
        };
        canal.current = nuevo;
        return () => {
            nuevo.close();
            canal.current = null;
        };
    }, [consultas, limpiar, recuperar]);

    const entrar = useCallback(
        (sesion: Sesion) => {
            fijarToken(sesion.accessToken);
            marcarSesion(true);
            // Lo que estaba en caché era del invitado (p. ej. su carrito, que ahora se fusionó).
            consultas.clear();
            setUsuario(sesion.usuario);
            setSesionVencida(false);
            setEstado('autenticado');
            canal.current?.postMessage('inicio' satisfies Mensaje);
            return sesion.usuario;
        },
        [consultas],
    );

    const iniciarSesion = useCallback(
        async (datos: DatosIngreso) => entrar((await api.post('/auth/login', { cuerpo: datos })).data),
        [entrar],
    );

    const registrarse = useCallback(
        async (datos: DatosRegistro) => entrar((await api.post('/auth/registro', { cuerpo: datos })).data),
        [entrar],
    );

    const actualizarNombre = useCallback((nombre: string, apellido: string) => {
        setUsuario((actual) => actual && { ...actual, nombre, apellido });
    }, []);

    const cerrarSesion = useCallback(async () => {
        try {
            await api.post('/auth/logout');
        } catch (error) {
            // Sin conexión la sesión se cierra igual en este navegador; la cookie vence por su cuenta.
            if (!esErrorApi(error)) throw error;
        } finally {
            setSesionVencida(false);
            limpiar();
            canal.current?.postMessage('cierre' satisfies Mensaje);
        }
    }, [limpiar]);

    const valor = useMemo<ValorSesion>(
        () => ({
            estado,
            usuario,
            sesionVencida,
            iniciarSesion,
            registrarse,
            actualizarNombre,
            cerrarSesion,
            reintentar: () => void recuperar(),
        }),
        [estado, usuario, sesionVencida, iniciarSesion, registrarse, actualizarNombre, cerrarSesion, recuperar],
    );

    let contenido = children;
    if (estado === 'cargando') contenido = <EsqueletoApp />;
    if (estado === 'sin-servicio') {
        contenido = (
            <main className="container py-5">
                <EstadoError
                    titulo="No pudimos conectar con la tienda"
                    mensaje="Revisa tu conexión a internet e intenta de nuevo."
                    alReintentar={valor.reintentar}
                />
            </main>
        );
    }
    return <ContextoSesion value={valor}>{contenido}</ContextoSesion>;
}
