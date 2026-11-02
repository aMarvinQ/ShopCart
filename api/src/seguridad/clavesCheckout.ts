import { createHmac, hkdfSync } from 'node:crypto';

/*
    Claves que el checkout deriva del secreto del servidor (HMAC-SHA256 con subclaves HKDF, una
    por uso):
    - Token de seguimiento de un pedido: 256 bits, imposible de adivinar sin el secreto, y el
      mismo para el mismo checkout. Así un doble clic o un reintento del pago devuelve el mismo
      enlace, que funciona (la base guarda solo su SHA-256).
    - Clave de idempotencia del cobro: checkout + tarjeta. El mismo pago repetido es el mismo
      cobro; otra tarjeta es otro intento. El número de tarjeta entra al HMAC y no sale de
      memoria: la clave no permite recuperarlo.
*/
export class ClavesCheckout {
    private readonly seguimiento: Buffer;
    private readonly cobro: Buffer;

    constructor(secreto: string) {
        this.seguimiento = Buffer.from(hkdfSync('sha256', secreto, 'shopcart', 'seguimiento-pedido', 32));
        this.cobro = Buffer.from(hkdfSync('sha256', secreto, 'shopcart', 'idempotencia-cobro', 32));
    }

    tokenSeguimiento(idCheckout: number): string {
        return createHmac('sha256', this.seguimiento)
            .update(`checkout:${String(idCheckout)}`)
            .digest('base64url');
    }

    claveCobro(idCheckout: number, numeroTarjeta: string, vencimiento: string): string {
        return createHmac('sha256', this.cobro)
            .update(`${String(idCheckout)}|${numeroTarjeta}|${vencimiento}`)
            .digest('base64url');
    }
}
