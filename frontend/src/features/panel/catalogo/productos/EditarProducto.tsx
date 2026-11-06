import { CircleCheck, CircleSlash, ExternalLink, PackageX } from 'lucide-react';
import { useParams } from 'react-router';
import { esErrorApi } from '../../../../api/errores';
import { BotonEnlace } from '../../../../ui/Boton';
import { Esqueleto } from '../../../../ui/Esqueleto';
import { EstadoError, EstadoVacio, Insignia } from '../../../../ui/Mensajes';
import { MigaPan, PestanasFiltro } from '../../../../ui/Navegacion';
import { useVistaUrl } from '../../../../ui/useVistaUrl';
import { GeneralProducto } from './GeneralProducto';
import { HistorialProducto } from './HistorialProducto';
import { useProducto } from './hooks/useEdicionProducto';
import { ImagenesProducto } from './ImagenesProducto';
import { VariantesProducto } from './VariantesProducto';
import estilos from './productos.module.scss';

const VISTAS = [
    { valor: 'general', etiqueta: 'General' },
    { valor: 'variantes', etiqueta: 'Variantes' },
    { valor: 'imagenes', etiqueta: 'Imágenes' },
    { valor: 'historial', etiqueta: 'Historial de precios' },
] as const;

export default function EditarProducto() {
    const { id } = useParams();
    const consulta = useProducto(Number(id));
    const { vista, elegir } = useVistaUrl(VISTAS);
    const producto = consulta.data?.data;
    const noExiste = esErrorApi(consulta.error) && (consulta.error.estado === 404 || consulta.error.estado === 400);

    const pestanas = VISTAS.map((v) =>
        v.valor === 'variantes' && producto ? { ...v, conteo: producto.variantes.length } : v,
    );

    return (
        <section className={estilos.edicion}>
            <title>{`${producto?.nombre ?? 'Producto'} · ShopCart`}</title>
            <MigaPan
                rutas={[{ etiqueta: 'Catálogo', a: '/panel/catalogo' }, { etiqueta: producto?.nombre ?? 'Producto' }]}
            />
            {consulta.isPending && (
                <div role="status" aria-label="Cargando producto">
                    <Esqueleto ancho="50%" alto="2rem" />
                    <Esqueleto alto="20rem" style={{ marginTop: '1rem' }} radio="12px" />
                </div>
            )}
            {noExiste && (
                <EstadoVacio
                    nivel={1}
                    icono={PackageX}
                    titulo="No encontramos este producto"
                    accion={<BotonEnlace to="/panel/catalogo">Volver al catálogo</BotonEnlace>}
                />
            )}
            {consulta.isError && !noExiste && (
                <EstadoError
                    titulo="No pudimos cargar el producto"
                    mensaje={consulta.error.message}
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {producto && (
                <>
                    <div className={estilos.cabecera}>
                        <h1 className={estilos.titulo}>{producto.nombre}</h1>
                        {producto.activo ? (
                            <Insignia tono="exito" icono={CircleCheck}>
                                Visible
                            </Insignia>
                        ) : (
                            <Insignia tono="neutro" icono={CircleSlash}>
                                Oculto
                            </Insignia>
                        )}
                        <div className={estilos.cabeceraAcciones}>
                            <BotonEnlace
                                to={`/panel/inventario?busqueda=${encodeURIComponent(producto.nombre)}`}
                                variante="fantasma"
                            >
                                Ver existencias
                            </BotonEnlace>
                            {producto.activo && (
                                <BotonEnlace
                                    to={`/productos/${producto.slug}`}
                                    target="_blank"
                                    rel="noopener"
                                    variante="fantasma"
                                    iconoDerecha={ExternalLink}
                                >
                                    Ver en tienda
                                </BotonEnlace>
                            )}
                        </div>
                    </div>
                    <PestanasFiltro
                        etiqueta="Sección del producto"
                        opciones={pestanas}
                        valor={vista}
                        alCambiar={elegir}
                    />
                    {vista === 'general' && <GeneralProducto key={producto.idProducto} producto={producto} />}
                    {vista === 'variantes' && <VariantesProducto producto={producto} />}
                    {vista === 'imagenes' && <ImagenesProducto producto={producto} />}
                    {vista === 'historial' && <HistorialProducto producto={producto} />}
                </>
            )}
        </section>
    );
}
