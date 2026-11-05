import { ChevronDown, ChevronRight, LayoutGrid, ShoppingCart } from 'lucide-react';
import { Dropdown } from 'react-bootstrap';
import { Link } from 'react-router';
import { useCarrito } from '../../features/carrito/hooks/useCarrito';
import { useCategorias } from '../../features/tienda/hooks/useCatalogo';
import { useBuscadorTienda } from '../../features/tienda/hooks/useListaProductos';
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

export function BuscadorTienda() {
    const { texto, setTexto, buscar } = useBuscadorTienda();
    return (
        <form
            role="search"
            className={estilos.buscador}
            onSubmit={(evento) => {
                evento.preventDefault();
                buscar();
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
