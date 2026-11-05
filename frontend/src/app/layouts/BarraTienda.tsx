import { ChevronDown, ChevronRight, LayoutGrid, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useCarrito } from '../../features/carrito/consultas';
import { useCategorias } from '../../features/tienda/consultas';
import { CampoBusqueda } from '../../ui/Campo';
import estilos from './layouts.module.scss';

export function MenuCategorias() {
    const { data } = useCategorias();
    return (
        <Dropdown>
            <Dropdown.Toggle as="button" type="button" bsPrefix={estilos.botonCategorias ?? ''} aria-label="Categorías">
                <LayoutGrid size={20} aria-hidden="true" />
                <span className={estilos.textoCategorias}>Categorías</span>
                <ChevronDown size={16} className={estilos.textoCategorias} aria-hidden="true" />
            </Dropdown.Toggle>
            <Dropdown.Menu className={estilos.menuCategorias ?? ''}>
                {data?.data.map((c) => (
                    <Dropdown.Item as={Link} key={c.idCategoria} to={`/productos?categoria=${c.slug}`}>
                        {c.nombre}
                        <span className={`${estilos.conteo} numero`}>{c.productosVisibles}</span>
                    </Dropdown.Item>
                ))}
                <Dropdown.Divider />
                <Dropdown.Item as={Link} to="/productos">
                    Ver todos los productos
                    <ChevronRight size={16} className={estilos.conteo} aria-hidden="true" />
                </Dropdown.Item>
            </Dropdown.Menu>
        </Dropdown>
    );
}

/** Buscador: lleva a la lista con el texto en la URL. Si la URL cambia, el campo se actualiza. */
export function BuscadorTienda() {
    const navegar = useNavigate();
    const [parametros] = useSearchParams();
    const enUrl = parametros.get('texto') ?? '';
    const [texto, setTexto] = useState(enUrl);
    const [anterior, setAnterior] = useState(enUrl);
    if (enUrl !== anterior) {
        setAnterior(enUrl);
        setTexto(enUrl);
    }
    return (
        <form
            role="search"
            className={estilos.buscador}
            onSubmit={(evento) => {
                evento.preventDefault();
                const valor = texto.trim();
                void navegar(valor ? `/productos?texto=${encodeURIComponent(valor)}` : '/productos');
            }}
        >
            <CampoBusqueda
                etiqueta="Buscar productos"
                compacto
                maxLength={100}
                placeholder="Buscar productos o categorías"
                value={texto}
                onChange={({ target }) => {
                    setTexto(target.value);
                }}
            />
        </form>
    );
}

export function EnlaceCarrito() {
    const { data } = useCarrito();
    const cantidad = data?.data.cantidadArticulos ?? 0;
    return (
        <Link
            className={estilos.botonIcono}
            to="/carrito"
            aria-label={cantidad > 0 ? `Carrito, ${String(cantidad)} productos` : 'Carrito'}
        >
            <ShoppingCart size={20} aria-hidden="true" />
            {cantidad > 0 && (
                <span className={`${estilos.contadorCarrito} numero`} aria-hidden="true">
                    {cantidad}
                </span>
            )}
        </Link>
    );
}
