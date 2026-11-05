import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Esqueleto } from '../../ui/Esqueleto';
import { moneda } from '../../utils/formato';
import type { TarjetaDeProducto } from './hooks/useCatalogo';
import estilos from './tienda.module.scss';

/** Imagen del producto; sin imagen, o si no carga, un icono en el mismo espacio. */
export function ImagenProducto({
    ruta,
    texto,
    prioridad = false,
}: {
    ruta: string | null;
    texto: string | null;
    prioridad?: boolean;
}) {
    const [fallida, setFallida] = useState<string | null>(null);
    if (!ruta || ruta === fallida) {
        return (
            <span className={estilos.sinImagen}>
                <ImageOff aria-hidden="true" />
            </span>
        );
    }
    return (
        <img
            src={ruta}
            alt={texto ?? ''}
            loading={prioridad ? 'eager' : 'lazy'}
            decoding="async"
            onError={() => {
                setFallida(ruta);
            }}
        />
    );
}

export function TarjetaProducto({ producto, prioridad = false }: { producto: TarjetaDeProducto; prioridad?: boolean }) {
    const agotado = !producto.disponible;
    return (
        <article className={`card h-100 ${estilos.tarjeta} ${agotado ? estilos.agotado : ''}`}>
            <Link to={`/productos/${producto.slug}`} className={estilos.tarjetaImagen} tabIndex={-1} aria-hidden="true">
                <ImagenProducto ruta={producto.imagenPrincipal} texto="" prioridad={prioridad} />
                {agotado && <span className={`badge ${estilos.etiquetaAgotado}`}>Agotado</span>}
            </Link>
            <div className={`card-body ${estilos.tarjetaCuerpo}`}>
                <span className={`${estilos.precio} numero`}>{moneda(producto.precio)}</span>
                <h3 className={estilos.tarjetaNombre}>
                    <Link to={`/productos/${producto.slug}`}>{producto.nombre}</Link>
                </h3>
                <p className={estilos.tarjetaMeta}>
                    {producto.categoria}
                    {agotado && (
                        <>
                            {' · '}
                            <span className={estilos.metaAgotado}>Agotado</span>
                        </>
                    )}
                </p>
            </div>
        </article>
    );
}

/** Misma forma y medidas que la tarjeta: al llegar los datos, nada se mueve. */
export function EsqueletoTarjeta() {
    return (
        <div className={`card h-100 ${estilos.tarjeta}`} aria-hidden="true">
            <Esqueleto ancho="100%" alto="auto" radio="0" style={{ aspectRatio: '1 / 1' }} />
            <div className={`card-body ${estilos.tarjetaCuerpo}`}>
                <Esqueleto ancho="55%" alto="1.5rem" />
                <div className={estilos.tarjetaNombre}>
                    <Esqueleto alto="0.875rem" />
                    <Esqueleto ancho="70%" alto="0.875rem" style={{ marginTop: '0.5rem' }} />
                </div>
                <div className={estilos.tarjetaMeta}>
                    <Esqueleto ancho="60%" alto="0.75rem" />
                </div>
            </div>
        </div>
    );
}
