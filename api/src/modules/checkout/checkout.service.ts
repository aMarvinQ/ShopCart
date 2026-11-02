import type { Logger } from 'pino';
import { numeroErrorSql } from '../../db/index.js';
import { ErrorApi } from '../../errors/ErrorApi.js';
import type { DatosTarjeta, MotivoRechazo, PasarelaPagos } from '../../pagos/pasarela.js';
import { normalizarNumero } from '../../pagos/tarjeta.js';
import type { ClavesCheckout } from '../../seguridad/clavesCheckout.js';
import { hashToken } from '../../seguridad/tokens.js';
import { propietarioODesconocido, type Comprador, type Propietario } from '../carrito/comprador.js';
import { obtenerSeguimiento } from '../pedidos/pedidos.repository.js';
import * as repositorio from './checkout.repository.js';
import type { DatosIniciarCheckout } from './checkout.schemas.js';

/*
    Lo que la API agrega al checkout (las reglas de stock, cupón, totales y estados son del SP):
    - Quién compra y qué datos de envío corresponden a su tipo (dirección de la libreta o datos
      del invitado).
    - El cobro con la pasarela, en el orden que evita cobrar dos veces (plan 6.2):
      1. Si el checkout ya tiene pedido, se devuelve ese pedido sin cobrar.
      2. La pasarela cobra con una clave de idempotencia (checkout + tarjeta): el doble clic es el
         mismo cobro.
      3. Rechazado: se registra el intento y se responde 402 con el motivo (D73).
      4. Aprobado: el SP crea el pedido. Si la base lo rechaza por una regla (ya pagado con otro
         cobro, carrito cambiado, vencido sin existencia, cupón agotado), el cobro se anula. Si
         la falla no es de negocio (la conexión se cortó), no se anula: el pedido pudo crearse,
         y el reintento con la misma tarjeta llega al mismo cobro y obtiene el mismo pedido.
*/
const CHECKOUT_YA_PAGADO = 51602;

const RECHAZOS: Record<MotivoRechazo, [codigo: string, mensaje: string]> = {
    FONDOS_INSUFICIENTES: ['FONDOS_INSUFICIENTES', 'La tarjeta no tiene fondos suficientes; usa otra tarjeta.'],
    TARJETA_RECHAZADA: ['TARJETA_RECHAZADA', 'El banco rechazó la tarjeta; usa otra o contacta a tu banco.'],
    // Robada o extraviada: al comprador se le responde como un rechazo genérico.
    TARJETA_REPORTADA: ['TARJETA_RECHAZADA', 'El banco rechazó la tarjeta; usa otra o contacta a tu banco.'],
    TARJETA_VENCIDA: ['TARJETA_VENCIDA', 'El banco indica que la tarjeta está vencida; usa otra tarjeta.'],
    CVV_INCORRECTO: ['CVV_INCORRECTO', 'El código de seguridad (CVV) no coincide; revísalo.'],
    ERROR_PROCESADOR: ['PAGO_NO_PROCESADO', 'No se pudo procesar el pago; intenta de nuevo en unos minutos.'],
};

export interface PagoRealizado {
    pedido: Record<string, unknown>;
    tokenSeguimiento: string;
}

const esErrorDeNegocio = (error: unknown): boolean => {
    const numero = numeroErrorSql(error);
    return numero !== undefined && numero >= 50000 && numero < 60000;
};

function destinoSegun(propietario: Propietario, datos: DatosIniciarCheckout): repositorio.DestinoCheckout {
    const esCliente = 'idUsuario' in propietario;
    if (esCliente && datos.idDireccion === undefined) {
        throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'Elige una dirección de tu libreta.', [
            { campo: 'idDireccion', mensaje: 'obligatorio para un cliente registrado' },
        ]);
    }
    if (!esCliente && datos.invitado === undefined) {
        throw new ErrorApi(400, 'SOLICITUD_INVALIDA', 'Escribe tu correo y la dirección de envío.', [
            { campo: 'invitado', mensaje: 'obligatorio para comprar sin cuenta' },
        ]);
    }
    return esCliente
        ? { idMetodoEnvio: datos.idMetodoEnvio, idDireccion: datos.idDireccion }
        : { idMetodoEnvio: datos.idMetodoEnvio, invitado: datos.invitado };
}

export function crearServicioCheckout({ pasarela, claves }: { pasarela: PasarelaPagos; claves: ClavesCheckout }) {
    /** El pedido de un checkout pagado, con su enlace de seguimiento (el mismo en cada respuesta). */
    async function pedidoDe(idCheckout: number): Promise<PagoRealizado> {
        const tokenSeguimiento = claves.tokenSeguimiento(idCheckout);
        return { pedido: await obtenerSeguimiento(hashToken(tokenSeguimiento)), tokenSeguimiento };
    }

    return {
        iniciar(comprador: Comprador, claveIdempotencia: string, datos: DatosIniciarCheckout) {
            const propietario = propietarioODesconocido(comprador);
            return repositorio.iniciar(propietario, claveIdempotencia, destinoSegun(propietario, datos));
        },

        obtener(comprador: Comprador, idCheckout: number) {
            return repositorio.obtener(propietarioODesconocido(comprador), idCheckout);
        },

        async pagar(
            comprador: Comprador,
            idCheckout: number,
            tarjeta: DatosTarjeta,
            log: Logger,
        ): Promise<PagoRealizado> {
            const propietario = propietarioODesconocido(comprador);

            // 1. Ya pagado (doble clic o reintento después de la respuesta): el mismo pedido, sin cobrar.
            const checkout = await repositorio.obtener(propietario, idCheckout);
            if (checkout.idPedido !== null && checkout.idPedido !== undefined) return pedidoDe(idCheckout);
            if (checkout.estado === 'CANCELADO' || checkout.estado === 'CARRITO_MODIFICADO') {
                throw new ErrorApi(
                    409,
                    'CHECKOUT_NO_PAGABLE',
                    'El checkout se canceló o el carrito cambió; inicia el pago de nuevo.',
                );
            }
            // EXPIRADO sigue: el SP lo acepta si todo sigue disponible (D39) y, si no, se anula el cobro.

            // 2. Cobro idempotente.
            const numero = normalizarNumero(tarjeta.numero);
            const cobro = await pasarela.cobrar({
                claveIdempotencia: claves.claveCobro(idCheckout, numero, tarjeta.vencimiento),
                monto: Number(checkout.total),
                descripcion: `ShopCart checkout ${String(idCheckout)}`,
                tarjeta,
            });

            // 3. Rechazado.
            if (cobro.estado === 'RECHAZADO') {
                await repositorio.registrarPagoRechazado(propietario, idCheckout, cobro);
                log.info({ idCheckout, motivo: cobro.motivo, referencia: cobro.referencia }, 'Pago rechazado');
                const [codigo, mensaje] = RECHAZOS[cobro.motivo];
                throw new ErrorApi(402, codigo, mensaje);
            }

            // 4. Aprobado: el pedido.
            const tokenSeguimiento = claves.tokenSeguimiento(idCheckout);
            try {
                const pedido = await repositorio.crearPedido(
                    propietario,
                    idCheckout,
                    cobro,
                    hashToken(tokenSeguimiento),
                );
                return { pedido, tokenSeguimiento };
            } catch (error) {
                if (!esErrorDeNegocio(error)) {
                    log.error(
                        { err: error, idCheckout, referencia: cobro.referencia },
                        'Cobro aprobado sin confirmación del pedido: conciliar con la pasarela',
                    );
                    throw error;
                }
                try {
                    await pasarela.anular(cobro.referencia);
                } catch (errorAnulacion) {
                    log.error(
                        { err: errorAnulacion, idCheckout, referencia: cobro.referencia },
                        'No se pudo anular el cobro: conciliar con la pasarela',
                    );
                }
                log.warn(
                    { idCheckout, referencia: cobro.referencia, error: numeroErrorSql(error) },
                    'Cobro anulado: el pedido no se pudo crear',
                );
                // Otro cobro ganó la carrera (dos tarjetas a la vez): se responde con el pedido que quedó.
                if (numeroErrorSql(error) === CHECKOUT_YA_PAGADO) return pedidoDe(idCheckout);
                throw error;
            }
        },
    };
}

export type ServicioCheckout = ReturnType<typeof crearServicioCheckout>;
