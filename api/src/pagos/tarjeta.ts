/*
    Validación de una tarjeta antes de enviarla a la pasarela (D2): número con el algoritmo de
    Luhn, marca por prefijo con su longitud, vencimiento no pasado y CVV de 3 dígitos (4 en
    Amex). Ninguno de estos datos se guarda ni se registra en logs (PCI DSS): a la base solo
    llegan la marca y los últimos 4 dígitos.
*/
export type Marca = 'VISA' | 'MASTERCARD' | 'AMEX';

/** Quita espacios y guiones con los que el cliente suele escribir el número. */
export const normalizarNumero = (numero: string): string => numero.replace(/[\s-]/g, '');

/** Algoritmo de Luhn (ISO/IEC 7812): detecta errores de captura en el número. */
export function cumpleLuhn(numero: string): boolean {
    if (!/^\d+$/.test(numero)) return false;
    let suma = 0;
    for (let i = 0; i < numero.length; i += 1) {
        let digito = Number(numero[numero.length - 1 - i]);
        if (i % 2 === 1) {
            digito *= 2;
            if (digito > 9) digito -= 9;
        }
        suma += digito;
    }
    return suma % 10 === 0;
}

/** Marca por prefijo (IIN): Visa 4; Mastercard 51–55 y 2221–2720; Amex 34 y 37. */
export function marcaDe(numero: string): Marca | null {
    if (/^4/.test(numero)) return 'VISA';
    if (/^3[47]/.test(numero)) return 'AMEX';
    const dos = Number(numero.slice(0, 2));
    const cuatro = Number(numero.slice(0, 4));
    if ((dos >= 51 && dos <= 55) || (cuatro >= 2221 && cuatro <= 2720)) return 'MASTERCARD';
    return null;
}

const LONGITUDES: Record<Marca, number[]> = { VISA: [13, 16, 19], MASTERCARD: [16], AMEX: [15] };

export interface ProblemaTarjeta {
    campo: 'numero' | 'vencimiento' | 'cvv';
    mensaje: string;
}

/**
 * Revisa la tarjeta completa y devuelve cada problema por campo (vacío si es válida).
 * `vencimiento` llega como "MM/AA"; la tarjeta vale hasta el último día de ese mes.
 */
export function revisarTarjeta(
    tarjeta: { numero: string; vencimiento: string; cvv: string },
    ahora = new Date(),
): ProblemaTarjeta[] {
    const problemas: ProblemaTarjeta[] = [];
    const numero = normalizarNumero(tarjeta.numero);
    const marca = marcaDe(numero);

    if (!/^\d{13,19}$/.test(numero)) {
        problemas.push({ campo: 'numero', mensaje: 'el número debe tener de 13 a 19 dígitos' });
    } else if (!marca) {
        problemas.push({ campo: 'numero', mensaje: 'solo se aceptan Visa, Mastercard y American Express' });
    } else if (!LONGITUDES[marca].includes(numero.length)) {
        problemas.push({ campo: 'numero', mensaje: `un número ${marca} no tiene ${String(numero.length)} dígitos` });
    } else if (!cumpleLuhn(numero)) {
        problemas.push({ campo: 'numero', mensaje: 'el número de tarjeta no es válido; revísalo' });
    }

    const partes = /^(\d{2})\/(\d{2})$/.exec(tarjeta.vencimiento.trim());
    const mes = Number(partes?.[1]);
    if (!partes || mes < 1 || mes > 12) {
        problemas.push({ campo: 'vencimiento', mensaje: 'usa el formato MM/AA' });
    } else {
        const anio = 2000 + Number(partes[2]);
        // Vence al terminar el mes: el primer día del mes siguiente ya no es válida.
        if (Date.UTC(anio, mes, 1) <= ahora.getTime()) {
            problemas.push({ campo: 'vencimiento', mensaje: 'la tarjeta está vencida' });
        }
    }

    const digitosCvv = marca === 'AMEX' ? 4 : 3;
    if (!new RegExp(`^\\d{${String(digitosCvv)}}$`).test(tarjeta.cvv)) {
        problemas.push({ campo: 'cvv', mensaje: `el CVV debe tener ${String(digitosCvv)} dígitos` });
    }
    return problemas;
}
