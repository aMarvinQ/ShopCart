import { PackageSearch } from 'lucide-react';
import { useParams } from 'react-router';
import { esErrorApi } from '../../api/errores';
import { BotonEnlace } from '../../ui/Boton';
import { Esqueleto } from '../../ui/Esqueleto';
import { EstadoError, EstadoVacio } from '../../ui/Mensajes';
import { Tarjeta } from '../../ui/Navegacion';
import { DetallePedido } from './DetallePedido';
import { useSeguimiento } from './hooks/usePedidos';
import estilos from './pedidos.module.scss';

/** Seguimiento con el enlace secreto, sin iniciar sesión. */
export default function Seguimiento() {
    const { token = '' } = useParams();
    const consulta = useSeguimiento(token);
    const noExiste = esErrorApi(consulta.error) && (consulta.error.estado === 404 || consulta.error.estado === 400);

    return (
        <section className={estilos.seguimiento}>
            <title>Seguimiento del pedido · ShopCart</title>
            {consulta.isPending && (
                <Tarjeta className={estilos.panel}>
                    <div role="status" aria-label="Cargando pedido">
                        <Esqueleto ancho="50%" alto="1.75rem" />
                        <Esqueleto alto="16rem" style={{ marginTop: '1rem' }} />
                    </div>
                </Tarjeta>
            )}
            {noExiste && (
                <EstadoVacio
                    nivel={1}
                    icono={PackageSearch}
                    titulo="No encontramos este pedido"
                    mensaje="Revisa que el enlace esté completo."
                    accion={<BotonEnlace to="/">Ir a la tienda</BotonEnlace>}
                />
            )}
            {consulta.isError && !noExiste && (
                <EstadoError
                    titulo="No pudimos cargar el pedido"
                    mensaje={consulta.error.message}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {consulta.isSuccess && (
                <Tarjeta className={estilos.panel}>
                    <DetallePedido pedido={consulta.data.data} nivel={1} />
                </Tarjeta>
            )}
        </section>
    );
}
