import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { api, type DatosDe } from '../../../api/cliente';
import { esErrorApi } from '../../../api/errores';
import { useSesion } from '../../../sesion/contexto';
import { aplicarErroresApi } from '../../../utils/formularios';
import { useCarrito } from '../../carrito/hooks/useCarrito';
import {
    CAMPOS_DIRECCION_API,
    cuerpoDireccion,
    esquemaCamposDireccion,
    valoresDireccion,
} from '../../cuenta/datosDireccion';
import { useMetodosEnvio } from '../../tienda/hooks/useCatalogo';

export type DatosCheckout = DatosDe<'get', '/checkout/{id}'>;
export type PagoRealizado = DatosDe<'post', '/checkout/{id}/pago'>;

const esquemaInvitado = esquemaCamposDireccion.extend({ correo: z.email('Escribe un correo válido.') });
type DatosInvitado = z.infer<typeof esquemaInvitado>;

/* Largo según la marca, por el primer dígito: Amex 15 (empieza con 3); Visa 13 o 16 (con 4); las demás 16. */
const longitudesDe = (digitos: string): readonly number[] => {
    if (digitos.startsWith('3')) return [15];
    if (digitos.startsWith('4')) return [13, 16];
    return [16];
};

const longitudValida = (numero: string) => {
    const digitos = numero.replace(/\D/g, '');
    return longitudesDe(digitos).includes(digitos.length);
};

/* Formato básico para avisar antes de enviar; la tarjeta la valida la API (marca, Luhn, vencimiento). */
const esquemaTarjeta = z.object({
    tarjeta: z.object({
        numero: z.string().refine(longitudValida, 'Escribe el número completo de la tarjeta.'),
        titular: z
            .string()
            .trim()
            .min(2, 'Escribe el nombre que aparece en la tarjeta.')
            .max(100, 'Máximo 100 caracteres.'),
        vencimiento: z.string().regex(/^(0[1-9]|1[0-2])\/\d{2}$/, 'Usa el formato MM/AA.'),
        cvv: z.string().regex(/^\d{3,4}$/, 'Escribe los 3 o 4 dígitos de seguridad.'),
    }),
});
type DatosTarjeta = z.infer<typeof esquemaTarjeta>;

/** 4242424242424242 → 4242 4242 4242 4242 */
export function formatearNumeroTarjeta(valor: string) {
    const digitos = valor.replace(/\D/g, '');
    return digitos.slice(0, Math.max(...longitudesDe(digitos))).replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** 1230 → 12/30 */
export function formatearVencimiento(valor: string) {
    const digitos = valor.replace(/\D/g, '').slice(0, 4);
    return digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
}

/** Tiempo de una reserva. Se apoya en el reloj para no atrasarse; al llegar a cero avisa una sola vez. */
export function useCuentaRegresiva(segundos: number, recibidoEn: number, alTerminar: () => void) {
    const fin = recibidoEn + segundos * 1000;
    const restantes = () => Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    const [valor, setValor] = useState(restantes);
    const aviso = useRef(alTerminar);

    useEffect(() => {
        aviso.current = alTerminar;
    });

    useEffect(() => {
        const calcular = () => Math.max(0, Math.ceil((fin - Date.now()) / 1000));
        setValor(calcular());
        const intervalo = setInterval(() => {
            const actual = calcular();
            setValor(actual);
            if (actual === 0) {
                clearInterval(intervalo);
                aviso.current();
            }
        }, 1000);
        return () => {
            clearInterval(intervalo);
        };
    }, [fin]);

    return valor;
}

/**
 * Primer paso: contacto, dirección y envío. Al confirmar se reserva la existencia y el id queda en la
 * URL, así recargar no pierde la reserva. El formulario se conserva por si el cliente vuelve a cambiarlo.
 */
export function useEntrega() {
    const { usuario } = useSesion();
    const esInvitado = usuario === null;
    const [parametros, setParametros] = useSearchParams();
    const consultas = useQueryClient();

    const carrito = useCarrito();
    const metodos = useMetodosEnvio();
    const direcciones = useQuery({
        queryKey: ['direcciones'],
        queryFn: ({ signal }) => api.get('/direcciones', { signal }),
        enabled: usuario?.codigoRol === 'CLIENTE',
    });

    const [metodoElegido, elegirMetodo] = useState<number | null>(null);
    const [direccionElegida, elegirDireccion] = useState<number | null>(null);
    const [errorDireccion, setErrorDireccion] = useState<string | undefined>();
    const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
    const clave = useRef<string>(crypto.randomUUID());

    const formulario = useForm<DatosInvitado>({
        resolver: zodResolver(esquemaInvitado),
        defaultValues: { ...valoresDireccion(), correo: '' },
    });

    const listaDirecciones = direcciones.data?.data ?? [];
    const idMetodo = metodoElegido ?? metodos.data?.data[0]?.idMetodoEnvio;
    const idDireccion =
        direccionElegida ??
        listaDirecciones.find((d) => d.esPredeterminada)?.idDireccion ??
        listaDirecciones[0]?.idDireccion;

    const reservar = useMutation({
        mutationFn: (cuerpo: {
            idMetodoEnvio: number;
            idDireccion?: number;
            invitado?: ReturnType<typeof cuerpoInvitado>;
        }) => api.post('/checkout', { cuerpo, cabeceras: { 'idempotency-key': clave.current } }),
        onSuccess: ({ data }) => {
            clave.current = crypto.randomUUID();
            consultas.setQueryData(['checkout', String(data.idCheckout)], { data });
            setParametros({ id: String(data.idCheckout) }, { replace: true });
        },
        onError: (error) => {
            // Con una respuesta definitiva, reintentar es otra solicitud; sin respuesta, repite la misma.
            if (esErrorApi(error) && !error.esPasajero) clave.current = crypto.randomUUID();
            setErrorGeneral(
                aplicarErroresApi(
                    error,
                    formulario.setError,
                    [...CAMPOS_DIRECCION_API, 'correo'],
                    'No pudimos reservar tus productos; intenta de nuevo.',
                    'invitado.',
                ),
            );
        },
    });

    const continuar = async () => {
        setErrorGeneral(null);
        if (idMetodo === undefined) return;
        if (esInvitado) {
            await formulario.handleSubmit((datos) => {
                reservar.mutate({ idMetodoEnvio: idMetodo, invitado: cuerpoInvitado(datos) });
            })();
            return;
        }
        if (idDireccion === undefined) {
            setErrorDireccion('Agrega una dirección para continuar.');
            return;
        }
        setErrorDireccion(undefined);
        reservar.mutate({ idMetodoEnvio: idMetodo, idDireccion });
    };

    return {
        esInvitado,
        usuario,
        carrito,
        metodos: metodos.data?.data ?? [],
        idMetodo,
        elegirMetodo,
        direcciones: listaDirecciones,
        idDireccion,
        elegirDireccion,
        errorDireccion,
        formulario,
        errorGeneral,
        reservando: reservar.isPending,
        continuar,
        idCheckout: parametros.get('id'),
        cambiarDatos: () => {
            setParametros({}, { replace: true });
        },
    };
}

const cuerpoInvitado = ({ correo, ...direccion }: DatosInvitado) => ({ ...cuerpoDireccion(direccion), correo });

/** La reserva vigente. Al vencer el tiempo se consulta de nuevo: quien decide que venció es el servidor. */
export function useReserva(idCheckout: string) {
    return useQuery({
        queryKey: ['checkout', idCheckout],
        queryFn: ({ signal }) => api.get('/checkout/{id}', { params: { id: Number(idCheckout) }, signal }),
        staleTime: 0,
    });
}

/**
 * Segundo paso. La tarjeta solo vive en este formulario: no se guarda en caché, URL ni almacenamiento.
 * El botón bloquea el doble clic, y la API solo cobra una reserva pendiente una vez.
 */
export function usePago(checkout: DatosCheckout, alCambiarReserva: () => void) {
    const navegar = useNavigate();
    const consultas = useQueryClient();
    const [rechazo, setRechazo] = useState<{ mensaje: string; referencia: string | undefined } | null>(null);
    const formulario = useForm<DatosTarjeta>({
        resolver: zodResolver(esquemaTarjeta),
        defaultValues: { tarjeta: { numero: '', titular: '', vencimiento: '', cvv: '' } },
    });

    const pagar = useMutation({
        mutationFn: ({ tarjeta }: DatosTarjeta) =>
            api.post('/checkout/{id}/pago', {
                params: { id: checkout.idCheckout },
                cuerpo: { tarjeta },
            }),
        onSuccess: async ({ data }) => {
            formulario.reset();
            consultas.removeQueries({ queryKey: ['checkout'] });
            await consultas.invalidateQueries({ queryKey: ['carrito'] });
            await consultas.invalidateQueries({ queryKey: ['mis-pedidos'] });
            await navegar('/checkout/confirmacion', {
                replace: true,
                state: {
                    pedido: data.pedido,
                    tokenSeguimiento: data.tokenSeguimiento,
                    diasEstimadosMin: checkout.diasEstimadosMin,
                    diasEstimadosMax: checkout.diasEstimadosMax,
                } satisfies DatosConfirmacion,
            });
        },
        onError: (error) => {
            if (esErrorApi(error) && ['CHECKOUT_NO_PAGABLE', 'CARRITO_MODIFICADO'].includes(error.codigo)) {
                alCambiarReserva();
            }
            const mensaje = aplicarErroresApi(
                error,
                formulario.setError,
                ['tarjeta.numero', 'tarjeta.titular', 'tarjeta.vencimiento', 'tarjeta.cvv'],
                'No pudimos procesar el pago; intenta de nuevo.',
            );
            setRechazo(mensaje ? { mensaje, referencia: esErrorApi(error) ? error.requestId : undefined } : null);
        },
    });

    return {
        formulario,
        rechazo,
        pagando: pagar.isPending,
        enviar: formulario.handleSubmit((datos) => {
            setRechazo(null);
            pagar.mutate(datos);
        }),
    };
}

export interface DatosConfirmacion {
    pedido: PagoRealizado['pedido'];
    tokenSeguimiento: string;
    diasEstimadosMin: number;
    diasEstimadosMax: number;
}
