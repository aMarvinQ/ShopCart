import { moneda } from '../../utils/formato';
import type { Carrito, LineaCarrito } from './hooks/useCarrito';

/* La API dice en qué estado está cada cosa; aquí solo se traduce a un mensaje para el cliente. */
export function avisoDeLinea({ estado, cantidadMaxima }: LineaCarrito): string | null {
    if (estado === 'AGOTADO') return 'Se agotó. Quítalo para continuar.';
    if (estado === 'NO_DISPONIBLE') return 'Ya no está a la venta. Quítalo para continuar.';
    if (estado === 'CANTIDAD_EXCEDIDA') return `Solo puedes llevar ${String(cantidadMaxima)}. Ajusta la cantidad.`;
    return null;
}

export function avisoDeCupon({ cupon }: Carrito): string | null {
    if (!cupon || cupon.aplicable) return null;
    if (cupon.codigoError === 'CUPON_MONTO_MINIMO' && cupon.montoFaltante !== null) {
        return `Faltan ${moneda(cupon.montoFaltante)} para usar este cupón.`;
    }
    return 'Este cupón no aplica a tu carrito. Quítalo para continuar.';
}
