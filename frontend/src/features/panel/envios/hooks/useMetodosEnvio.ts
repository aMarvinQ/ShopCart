import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DatosDe } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';

export type MetodoEnvio = DatosDe<'get', '/metodos-envio'>[number];

export const CLAVE_METODOS = ['panel', 'metodos-envio'];
/** La lista que ve el cliente al pagar; se renueva con cada cambio del panel. */
export const CLAVE_METODOS_TIENDA = ['tienda', 'metodos-envio'];

export async function renovarMetodos(consultas: ReturnType<typeof useQueryClient>) {
    await Promise.all([
        consultas.invalidateQueries({ queryKey: CLAVE_METODOS }),
        consultas.invalidateQueries({ queryKey: CLAVE_METODOS_TIENDA }),
    ]);
}

export function useMetodosEnvio() {
    const consultas = useQueryClient();
    const avisar = useAvisos();

    const consulta = useQuery({
        queryKey: CLAVE_METODOS,
        queryFn: ({ signal }) => api.get('/metodos-envio', { signal }),
        staleTime: 15_000,
    });
    const metodos = consulta.data?.data;
    const activos = metodos?.filter((m) => m.activo).length ?? 0;

    const cambiarEstado = useMutation({
        mutationFn: ({ id, activo }: { id: number; activo: boolean; deshaciendo?: boolean }) =>
            api.patch('/metodos-envio/{id}/estado', { params: { id }, cuerpo: { activo } }),
        onSuccess: ({ data }, { deshaciendo }) => {
            avisar({
                tipo: 'exito',
                titulo: `${data.nombre} ${data.activo ? 'activado' : 'desactivado'}`,
                detalle: data.activo ? 'Ya aparece en el pago.' : 'Ya no aparece en el pago.',
                // Deshacer devuelve el estado anterior; deshacer un deshacer no tiene sentido.
                ...(!deshaciendo && {
                    accion: {
                        etiqueta: 'Deshacer',
                        alElegir: () => {
                            cambiarEstado.mutate({ id: data.idMetodoEnvio, activo: !data.activo, deshaciendo: true });
                        },
                    },
                }),
            });
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo cambiar el estado', detalle: error.message });
        },
        onSettled: () => renovarMetodos(consultas),
    });

    return {
        consulta,
        metodos,
        activos,
        cambiando: cambiarEstado.isPending,
        /** El único activo no se apaga: la tienda no podría vender (ULTIMO_METODO_ENVIO). */
        esUltimoActivo: (m: MetodoEnvio) => m.activo && activos === 1,
        alternar: (m: MetodoEnvio) => {
            cambiarEstado.mutate({ id: m.idMetodoEnvio, activo: !m.activo });
        },
    };
}
