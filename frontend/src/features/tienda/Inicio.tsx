import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router';
import { BotonEnlace } from '../../ui/Boton';
import { Esqueleto } from '../../ui/Esqueleto';
import { useCategorias } from './consultas';
import { FilaProductos } from './FilaProductos';
import estilos from './tienda.module.scss';

const CATEGORIAS_EN_INICIO = 3;

export default function Inicio() {
    const { data, isPending } = useCategorias();
    const categorias = [...(data?.data ?? [])]
        .sort((a, b) => b.productosVisibles - a.productosVisibles)
        .slice(0, CATEGORIAS_EN_INICIO);
    const destacada = categorias[0];

    return (
        <div className={estilos.inicio}>
            <title>ShopCart</title>
            <div className={estilos.portada}>
                <section className={estilos.portadaPrincipal}>
                    <div>
                        <h1>Todo lo que buscas, en un solo lugar</h1>
                        <p>Compra en línea y recibe tu pedido en toda Guatemala.</p>
                        <BotonEnlace to="/productos" variante="acento" tamano="lg">
                            Ver productos
                        </BotonEnlace>
                    </div>
                    <ShoppingBag className={estilos.portadaIcono} strokeWidth={1.25} aria-hidden="true" />
                </section>
                <div className={estilos.portadaLateral}>
                    <Link to="/productos" className={estilos.portadaTarjetaSuave}>
                        <span>Recién llegados</span>
                        <strong>Lo más nuevo de la tienda</strong>
                        <em>
                            Ver productos <ArrowRight size={16} aria-hidden="true" />
                        </em>
                    </Link>
                    {destacada ? (
                        <Link to={`/productos?categoria=${destacada.slug}`} className={estilos.portadaTarjeta}>
                            <span>Categoría</span>
                            <strong>{destacada.nombre}</strong>
                            <em>
                                Ver productos <ArrowRight size={16} aria-hidden="true" />
                            </em>
                        </Link>
                    ) : (
                        <div className={estilos.portadaTarjeta}>
                            {isPending && <Esqueleto ancho="70%" alto="1.5rem" />}
                        </div>
                    )}
                </div>
            </div>
            <FilaProductos
                titulo="Recién llegados"
                filtros={{ ordenarPor: 'RECIENTES' }}
                verTodo="/productos"
                prioridad
            />
            {categorias.map((c) => (
                <FilaProductos
                    key={c.idCategoria}
                    titulo={c.nombre}
                    filtros={{ categoria: c.slug }}
                    verTodo={`/productos?categoria=${c.slug}`}
                />
            ))}
        </div>
    );
}
