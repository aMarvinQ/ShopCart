import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, SIN_CONEXION } from '../api/errores';
import { rutaInternaSegura } from '../utils/rutas';
import { useSesion } from './contexto';
import { inicioDe, MENU_CUENTA, MENU_PANEL, menuPara, puede, rolesDe } from './permisos';
import { ProveedorSesion } from './ProveedorSesion';
import { renovarSesion, type Sesion } from './renovacion';
import { RutaProtegida } from './RutaProtegida';
import { avisarSesionTerminada, obtenerToken } from './token';

vi.mock('./renovacion', () => ({ renovarSesion: vi.fn() }));
const mockPost = vi.hoisted(() => vi.fn());
vi.mock('../api/cliente', () => ({ api: { post: mockPost } }));

const USUARIO = {
    idUsuario: 1,
    correo: 'a@b.test',
    nombre: 'Ana',
    apellido: 'Paz',
    codigoRol: 'OPERADOR',
} satisfies Sesion['usuario'];
const SESION: Sesion = { accessToken: 'jwt', tipo: 'Bearer', expiraEn: 900, usuario: USUARIO };
const MARCA = 'shopcart_con_sesion';

function Estado() {
    const { estado, usuario, sesionVencida, cerrarSesion, iniciarSesion } = useSesion();
    return (
        <div>
            <p>estado: {estado}</p>
            <p>usuario: {usuario?.nombre ?? 'nadie'}</p>
            {sesionVencida && <p>vencida</p>}
            <button onClick={() => void cerrarSesion()}>salir</button>
            <button onClick={() => void iniciarSesion({ correo: 'a@b.test', contrasena: 'x' })}>entrar</button>
        </div>
    );
}

function montar(consultas = new QueryClient()) {
    return render(
        <QueryClientProvider client={consultas}>
            <ProveedorSesion>
                <Estado />
            </ProveedorSesion>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    localStorage.clear();
    vi.mocked(renovarSesion).mockReset();
    mockPost.mockReset();
});

describe('sesión', () => {
    it('quien nunca inició sesión no llama a renovar: entra como invitado al instante', () => {
        montar();
        expect(screen.getByText('estado: anonimo')).toBeInTheDocument();
        expect(renovarSesion).not.toHaveBeenCalled();
    });

    it('con sesión previa no monta las pantallas hasta saber quién es (ninguna petición sale como invitado)', async () => {
        localStorage.setItem(MARCA, '1');
        let responder: (s: Sesion) => void = () => undefined;
        vi.mocked(renovarSesion).mockReturnValue(new Promise((r) => (responder = r)));
        montar();
        expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
        expect(screen.queryByText(/^estado:/)).not.toBeInTheDocument();
        act(() => {
            responder(SESION);
        });
        expect(await screen.findByText('usuario: Ana')).toBeInTheDocument();
    });

    it('si la cookie ya no sirve, entra como invitado', async () => {
        localStorage.setItem(MARCA, '1');
        vi.mocked(renovarSesion).mockResolvedValue(null);
        montar();
        expect(await screen.findByText('estado: anonimo')).toBeInTheDocument();
    });

    it('una falla pasajera ofrece reintentar en lugar de sacar al usuario', async () => {
        localStorage.setItem(MARCA, '1');
        vi.mocked(renovarSesion)
            .mockRejectedValueOnce(new ErrorApi(0, SIN_CONEXION, 'x'))
            .mockResolvedValue(SESION);
        montar();
        await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
        expect(await screen.findByText('usuario: Ana')).toBeInTheDocument();
    });

    it('al iniciar sesión guarda el token solo en memoria y vacía el caché del invitado', async () => {
        const consultas = new QueryClient();
        consultas.setQueryData(['carrito'], { invitado: true });
        mockPost.mockResolvedValue({ data: SESION });
        montar(consultas);
        await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
        expect(await screen.findByText('usuario: Ana')).toBeInTheDocument();
        expect(obtenerToken()).toBe('jwt');
        expect(consultas.getQueryData(['carrito'])).toBeUndefined();
        expect(Object.keys(localStorage)).toEqual([MARCA]);
        expect(JSON.stringify(localStorage)).not.toContain('jwt');
    });

    it('al cerrar sesión borra token, marca y caché: el siguiente usuario no ve nada del anterior', async () => {
        const consultas = new QueryClient();
        mockPost.mockResolvedValue({ data: SESION });
        montar(consultas);
        await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
        await screen.findByText('usuario: Ana');
        consultas.setQueryData(['mis-pedidos'], [{ id: 1 }]);
        mockPost.mockResolvedValue(undefined);

        await userEvent.click(screen.getByRole('button', { name: 'salir' }));
        expect(await screen.findByText('estado: anonimo')).toBeInTheDocument();
        expect(obtenerToken()).toBeNull();
        expect(localStorage.getItem(MARCA)).toBeNull();
        expect(consultas.getQueryData(['mis-pedidos'])).toBeUndefined();
    });

    it('sin conexión también cierra la sesión en este navegador', async () => {
        mockPost.mockResolvedValueOnce({ data: SESION }).mockRejectedValueOnce(new ErrorApi(0, SIN_CONEXION, 'x'));
        montar();
        await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
        await screen.findByText('usuario: Ana');
        await userEvent.click(screen.getByRole('button', { name: 'salir' }));
        expect(await screen.findByText('estado: anonimo')).toBeInTheDocument();
    });

    it('si la sesión termina sola, lo indica y limpia todo', async () => {
        const consultas = new QueryClient();
        consultas.setQueryData(['perfil'], { nombre: 'Ana' });
        mockPost.mockResolvedValue({ data: SESION });
        montar(consultas);
        await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
        await screen.findByText('usuario: Ana');
        consultas.setQueryData(['perfil'], { nombre: 'Ana' });
        act(() => {
            avisarSesionTerminada();
        });
        expect(await screen.findByText('vencida')).toBeInTheDocument();
        expect(consultas.getQueryData(['perfil'])).toBeUndefined();
    });

    it('sin fugas: al desmontar cierra el canal entre pestañas y deja de escuchar', () => {
        const cerrar = vi.spyOn(BroadcastChannel.prototype, 'close');
        const { unmount } = montar();
        unmount();
        expect(cerrar).toHaveBeenCalled();
        // Avisar después de desmontar no debe actualizar nada (ni lanzar errores).
        expect(() => {
            avisarSesionTerminada();
        }).not.toThrow();
    });

    it('otra pestaña cierra sesión: esta también', async () => {
        mockPost.mockResolvedValue({ data: SESION });
        montar();
        await userEvent.click(screen.getByRole('button', { name: 'entrar' }));
        await screen.findByText('usuario: Ana');
        const otraPestana = new BroadcastChannel('shopcart-sesion');
        otraPestana.postMessage('cierre');
        await waitFor(() => {
            expect(screen.getByText('estado: anonimo')).toBeInTheDocument();
        });
        otraPestana.close();
    });
});

describe('guardas de ruta', () => {
    function navegarComo(usuario: Sesion | null, inicial: string) {
        if (usuario) localStorage.setItem(MARCA, '1');
        vi.mocked(renovarSesion).mockResolvedValue(usuario);
        const enrutador = createMemoryRouter(
            [
                { path: '/ingresar', element: <p>pantalla de ingreso</p> },
                {
                    element: <RutaProtegida roles={['ADMIN']} />,
                    children: [{ path: '/panel/usuarios', element: <p>usuarios</p> }],
                },
            ],
            { initialEntries: [inicial] },
        );
        render(
            <QueryClientProvider client={new QueryClient()}>
                <ProveedorSesion>
                    <RouterProvider router={enrutador} />
                </ProveedorSesion>
            </QueryClientProvider>,
        );
        return enrutador;
    }

    it('sin sesión lleva a ingresar conservando a dónde iba', async () => {
        const enrutador = navegarComo(null, '/panel/usuarios?pagina=2');
        expect(await screen.findByText('pantalla de ingreso')).toBeInTheDocument();
        expect(enrutador.state.location.search).toBe(`?volver=${encodeURIComponent('/panel/usuarios?pagina=2')}`);
    });

    it('con un rol no permitido muestra sin permiso y no el contenido', async () => {
        navegarComo(SESION, '/panel/usuarios');
        expect(await screen.findByText('No tienes acceso a esta sección')).toBeInTheDocument();
        expect(screen.queryByText('usuarios')).not.toBeInTheDocument();
    });

    it('con el rol correcto muestra el contenido', async () => {
        navegarComo({ ...SESION, usuario: { ...USUARIO, codigoRol: 'ADMIN' } }, '/panel/usuarios');
        expect(await screen.findByText('usuarios')).toBeInTheDocument();
    });
});

describe('tabla de permisos', () => {
    const rutasDe = (rol: 'CLIENTE' | 'OPERADOR' | 'ADMIN') => menuPara(MENU_PANEL, rol).map((e) => e.ruta);

    it('el operador ve solo la operación; el administrador, todo; el cliente, nada del panel', () => {
        expect(rutasDe('OPERADOR')).toEqual(['/panel/pedidos', '/panel/devoluciones', '/panel/inventario']);
        expect(rutasDe('ADMIN')).toHaveLength(MENU_PANEL.length);
        expect(rutasDe('CLIENTE')).toEqual([]);
        expect(menuPara(MENU_CUENTA, 'OPERADOR')).toEqual([]);
        expect(menuPara(MENU_CUENTA, 'CLIENTE')).toHaveLength(3);
    });

    it('sin rol no hay permisos; cada rol tiene su inicio', () => {
        expect(puede(undefined, ['ADMIN'])).toBe(false);
        expect(inicioDe('ADMIN')).toBe('/panel');
        expect(inicioDe('OPERADOR')).toBe('/panel/pedidos');
        expect(inicioDe('CLIENTE')).toBe('/');
        expect(() => rolesDe('/panel/no-existe')).toThrow();
    });
});

describe('redirección después de ingresar', () => {
    it.each([
        ['/cuenta/pedidos?pagina=2', '/cuenta/pedidos?pagina=2'],
        ['/', '/'],
    ])('acepta rutas internas: %s', (entrada, salida) => {
        expect(rutaInternaSegura(entrada)).toBe(salida);
    });

    it.each([
        'https://sitio-falso.com',
        '//sitio-falso.com',
        '/\\sitio-falso.com',
        'javascript:alert(1)',
        '/\tsitio',
        '/ruta\\con\\barras',
        '',
        null,
        undefined,
    ])('rechaza lo que saldría de la tienda: %s', (entrada) => {
        expect(rutaInternaSegura(entrada)).toBeNull();
    });
});
