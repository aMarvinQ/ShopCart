import { ejecutarProcedimiento, TipoSql } from '../../db/index.js';
import { parametrosPropietario, type Propietario } from '../carrito/comprador.js';
import { JSON_PEDIDO } from '../pedidos/pedidos.repository.js';
import type { DatosInvitado } from './checkout.schemas.js';

/*
    Checkout y pago. El dueño (cliente o invitado) es el mismo del carrito; un checkout ajeno
    responde igual que uno inexistente. Todos devuelven el checkout (SP_Checkout_Obtener) salvo
    la creación del pedido, que devuelve el pedido como lo ve el cliente.
*/
type Fila = Record<string, unknown>;
const JSON_CHECKOUT = { json: ['lineas'] };

const idCheckout = (id: number) => ({ IDCheckout: { tipo: TipoSql.BigInt, valor: id } });
const primera = async (promesa: ReturnType<typeof ejecutarProcedimiento>) => (await promesa).filas[0] as Fila;

export interface DestinoCheckout {
    idMetodoEnvio: number;
    idDireccion?: number | undefined;
    invitado?: DatosInvitado | undefined;
}

/** Idempotente por (carrito, clave): un reintento tras un deadlock devuelve el mismo checkout. */
export const iniciar = (p: Propietario, clave: string, { idMetodoEnvio, idDireccion, invitado }: DestinoCheckout) =>
    primera(
        ejecutarProcedimiento(
            'SP_Checkout_Iniciar',
            {
                ...parametrosPropietario(p),
                ClaveIdempotencia: { tipo: TipoSql.UniqueIdentifier, valor: clave },
                IDMetodoEnvio: { tipo: TipoSql.Int, valor: idMetodoEnvio },
                IDDireccion: { tipo: TipoSql.Int, valor: idDireccion ?? null },
                Correo: { tipo: TipoSql.NVarChar(255), valor: invitado?.correo ?? null },
                NombreDestinatario: { tipo: TipoSql.NVarChar(151), valor: invitado?.nombreDestinatario ?? null },
                Telefono: { tipo: TipoSql.NVarChar(21), valor: invitado?.telefono ?? null },
                Linea1: { tipo: TipoSql.NVarChar(201), valor: invitado?.linea1 ?? null },
                Linea2: { tipo: TipoSql.NVarChar(201), valor: invitado?.linea2 ?? null },
                IDMunicipio: { tipo: TipoSql.SmallInt, valor: invitado?.idMunicipio ?? null },
                CodigoPostal: { tipo: TipoSql.NVarChar(6), valor: invitado?.codigoPostal ?? null },
                Referencias: { tipo: TipoSql.NVarChar(301), valor: invitado?.referencias ?? null },
            },
            { ...JSON_CHECKOUT, reintentable: true },
        ),
    );

export const obtener = (p: Propietario, id: number) =>
    primera(
        ejecutarProcedimiento(
            'SP_Checkout_Obtener',
            { ...parametrosPropietario(p), ...idCheckout(id) },
            { ...JSON_CHECKOUT, reintentable: true },
        ),
    );

export interface PagoNoSensible {
    marca: string;
    ultimos4: string;
    referencia: string;
}

/** Idempotente por referencia de la pasarela. */
export const registrarPagoRechazado = (p: Propietario, id: number, pago: PagoNoSensible & { motivo: string }) =>
    primera(
        ejecutarProcedimiento(
            'SP_Checkout_RegistrarPagoRechazado',
            {
                ...parametrosPropietario(p),
                ...idCheckout(id),
                Marca: { tipo: TipoSql.VarChar(13), valor: pago.marca },
                Ultimos4: { tipo: TipoSql.VarChar(5), valor: pago.ultimos4 },
                MotivoRechazo: { tipo: TipoSql.VarChar(41), valor: pago.motivo },
                ReferenciaExterna: { tipo: TipoSql.VarChar(65), valor: pago.referencia },
            },
            { ...JSON_CHECKOUT, reintentable: true },
        ),
    );

/**
 * Crea el pedido con el pago aprobado. Idempotente por referencia: el mismo cobro repetido
 * devuelve el mismo pedido, así que se puede reintentar ante un deadlock.
 */
export const crearPedido = (
    p: Propietario,
    id: number,
    pago: PagoNoSensible & { codigoAutorizacion: string },
    tokenSeguimientoHash: Buffer,
) =>
    primera(
        ejecutarProcedimiento(
            'SP_Pedidos_Crear',
            {
                ...parametrosPropietario(p),
                ...idCheckout(id),
                Marca: { tipo: TipoSql.VarChar(13), valor: pago.marca },
                Ultimos4: { tipo: TipoSql.VarChar(5), valor: pago.ultimos4 },
                CodigoAutorizacion: { tipo: TipoSql.VarChar(21), valor: pago.codigoAutorizacion },
                ReferenciaExterna: { tipo: TipoSql.VarChar(65), valor: pago.referencia },
                TokenSeguimientoHash: { tipo: TipoSql.VarBinary(64), valor: tokenSeguimientoHash },
            },
            { ...JSON_PEDIDO, reintentable: true },
        ),
    );

/** Job: marca vencidos los checkouts pendientes y libera sus reservas (hasta 1000 por ejecución). */
export async function expirarVencidos(): Promise<{ checkoutsExpirados: number; reservasLiberadas: number }> {
    const fila = await primera(ejecutarProcedimiento('SP_Checkout_ExpirarVencidos', {}, { reintentable: true }));
    return {
        checkoutsExpirados: Number(fila.checkoutsExpirados ?? 0),
        reservasLiberadas: Number(fila.reservasLiberadas ?? 0),
    };
}
