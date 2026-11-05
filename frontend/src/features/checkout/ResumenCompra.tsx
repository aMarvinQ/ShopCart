import { Link } from 'react-router';
import { Tarjeta } from '../../ui/Navegacion';
import { moneda } from '../../utils/formato';
import type { Carrito } from '../carrito/hooks/useCarrito';
import { ImagenProducto } from '../tienda/TarjetaProducto';
import type { DatosCheckout } from './hooks/useCheckout';
import estilos from './checkout.module.scss';

interface LineaResumen {
    id: number;
    nombre: string;
    detalle: string;
    imagen: string | null;
    cantidad: number;
    precioUnitario: number;
    total: number;
}

function Lineas({ lineas }: { lineas: readonly LineaResumen[] }) {
    return (
        <ul className={estilos.lineas}>
            {lineas.map((l) => (
                <li key={l.id}>
                    <span className={estilos.lineaImagen}>
                        <ImagenProducto ruta={l.imagen} texto="" />
                    </span>
                    <div className={estilos.lineaDatos}>
                        <strong>{l.nombre}</strong>
                        <small className="numero">
                            {l.detalle && `${l.detalle} · `}
                            {l.cantidad} × {moneda(l.precioUnitario)}
                        </small>
                    </div>
                    <span className="numero fw-semibold">{moneda(l.total)}</span>
                </li>
            ))}
        </ul>
    );
}

function Fila({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase?: string | undefined }) {
    return (
        <div className={clase}>
            <dt>{etiqueta}</dt>
            <dd className="numero">{valor}</dd>
        </div>
    );
}

/** Antes de reservar: lo que dice el carrito. El total con envío e IVA lo da la API al reservar. */
export function ResumenCarrito({
    carrito,
    metodo,
}: {
    carrito: Carrito;
    metodo: { nombre: string; costo: number } | undefined;
}) {
    return (
        <Tarjeta className={estilos.resumen}>
            <h2>Tu pedido</h2>
            <Lineas
                lineas={carrito.items.map((i) => ({
                    id: i.idVariante,
                    nombre: i.producto,
                    detalle: i.descripcion,
                    imagen: i.imagen,
                    cantidad: i.cantidad,
                    precioUnitario: i.precioUnitario,
                    total: i.importe,
                }))}
            />
            <Link to="/carrito" className={estilos.editar}>
                Editar carrito
            </Link>
            <dl className={estilos.importes}>
                <Fila etiqueta="Subtotal" valor={moneda(carrito.subtotal)} />
                {carrito.descuento > 0 && (
                    <Fila
                        etiqueta={`Cupón ${carrito.cupon?.codigo ?? ''}`}
                        valor={`−${moneda(carrito.descuento)}`}
                        clase={estilos.descuento}
                    />
                )}
                {metodo && (
                    <Fila
                        etiqueta={`Envío: ${metodo.nombre}`}
                        valor={metodo.costo === 0 ? 'Sin costo' : moneda(metodo.costo)}
                    />
                )}
            </dl>
            <p className={estilos.nota}>El total final se muestra al continuar. Los precios incluyen IVA.</p>
        </Tarjeta>
    );
}

/** Con la reserva hecha: los totales definitivos de la API, con envío e IVA. */
export function ResumenReserva({ checkout }: { checkout: DatosCheckout }) {
    return (
        <Tarjeta className={estilos.resumen}>
            <h2>Tu pedido</h2>
            <Lineas
                lineas={checkout.lineas.map((l) => ({
                    id: l.idVariante,
                    nombre: l.producto,
                    detalle: l.descripcion,
                    imagen: l.imagen,
                    cantidad: l.cantidad,
                    precioUnitario: l.precioUnitario,
                    total: l.totalLinea,
                }))}
            />
            <dl className={estilos.importes}>
                <Fila etiqueta="Subtotal" valor={moneda(checkout.subtotal)} />
                {checkout.descuento > 0 && (
                    <Fila
                        etiqueta={`Cupón ${checkout.codigoCupon ?? ''}`}
                        valor={`−${moneda(checkout.descuento)}`}
                        clase={estilos.descuento}
                    />
                )}
                <Fila etiqueta="Envío" valor={checkout.costoEnvio === 0 ? 'Sin costo' : moneda(checkout.costoEnvio)} />
                <Fila etiqueta="Total" valor={moneda(checkout.total)} clase={estilos.total} />
            </dl>
            <p className={estilos.nota}>Incluye IVA de {moneda(checkout.iva)}</p>
        </Tarjeta>
    );
}
