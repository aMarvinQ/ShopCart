import { ArrowRight, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router';
import { BotonEnlace } from '../../ui/Boton';
import { Esqueleto } from '../../ui/Esqueleto';
import { FilaProductos } from './FilaProductos';
import { useCategoriasDestacadas } from './hooks/useCatalogo';
import estilos from './tienda.module.scss';

export default function Inicio() {
    const { categorias, cargando } = useCategoriasDestacadas();
    const destacada = categorias[0];

    return (
        <div className={estilos.inicio}>
            <title>ShopCart</title>
            <div className="row g-4">
                <div className="col-lg-8">
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
                </div>
                <div className="col-lg-4">
                    <div className="row g-4 h-100">
                        <div className="col-sm-6 col-lg-12">
                            <Link to="/productos" className={estilos.portadaTarjetaSuave}>
                                <span>Recién llegados</span>
                                <strong>Lo más nuevo de la tienda</strong>
                                <em>
                                    Ver productos <ArrowRight size={16} aria-hidden="true" />
                                </em>
                            </Link>
                        </div>
                        <div className="col-sm-6 col-lg-12">
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
                                    {cargando && <Esqueleto ancho="70%" alto="1.5rem" />}
                                </div>
                            )}
                        </div>
                    </div>
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
