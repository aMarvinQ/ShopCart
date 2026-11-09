import { etiquetaEntidad, nombreRegistro } from './detalleCambio';
import type { RegistroBitacora } from './hooks/useBitacora';

/** "Variante PRU-GRI-S" o "Pedido #104582" si el cambio no trae un nombre reconocible. */
export function textoRegistro(r: RegistroBitacora): string {
    const nombre = nombreRegistro(r.valorAnterior, r.valorNuevo);
    // Los IDs numéricos llevan #; una clave (como la de un parámetro) se muestra tal cual.
    const id = /^\d+$/.test(r.idEntidad) ? `#${r.idEntidad}` : r.idEntidad;
    return `${etiquetaEntidad(r.entidad)} ${nombre ?? id}`;
}

/** El personal aparece por nombre; un cliente lleva la marca, como en el mockup. */
export const textoAutor = (r: RegistroBitacora) => (r.codigoRol === 'CLIENTE' ? `${r.usuario} (cliente)` : r.usuario);
