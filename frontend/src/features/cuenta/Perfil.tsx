import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/cliente';
import { esErrorApi } from '../../api/errores';
import { EstadoError } from '../../ui/EstadoError';
import { Esqueleto } from '../../ui/Esqueleto';

/* Perfil: por ahora solo los datos. La edición y el cambio de contraseña llegan con la tienda. */
export default function Perfil() {
    const consulta = useQuery({
        queryKey: ['perfil'],
        queryFn: ({ signal }) => api.get('/perfil', { signal }),
    });

    return (
        <section>
            <title>Perfil · ShopCart</title>
            <h1 className="h3 mb-3">Perfil</h1>
            {consulta.isPending && (
                <div role="status" aria-label="Cargando perfil" className="card card-body">
                    <Esqueleto ancho="12rem" alto="1.5rem" />
                    <Esqueleto ancho="16rem" style={{ marginTop: '0.5rem' }} />
                </div>
            )}
            {consulta.isError && (
                <EstadoError
                    titulo="No pudimos cargar tu perfil"
                    mensaje={consulta.error.message}
                    referencia={esErrorApi(consulta.error) ? consulta.error.requestId : undefined}
                    alReintentar={() => void consulta.refetch()}
                />
            )}
            {consulta.isSuccess && (
                <div className="card card-body">
                    <p className="h5 mb-1" data-testid="perfil-nombre">
                        {consulta.data.data.nombre} {consulta.data.data.apellido}
                    </p>
                    <p className="text-secondary mb-0">{consulta.data.data.correo}</p>
                </div>
            )}
        </section>
    );
}
