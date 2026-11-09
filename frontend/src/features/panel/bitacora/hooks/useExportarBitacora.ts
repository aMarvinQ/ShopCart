import { useMutation } from '@tanstack/react-query';
import { api } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { guardarArchivo } from '../../../../utils/descargas';
import type { useBitacora } from './useBitacora';

type FiltrosApi = ReturnType<typeof useBitacora>['filtrosApi'];

/** Excel con los mismos filtros de la lista; la API corta en 10 000 registros y lo indica en el archivo. */
export function useExportarBitacora() {
    const avisar = useAvisos();
    const exportar = useMutation({
        mutationFn: (filtros: FiltrosApi) =>
            api.descargar('/bitacora/exportar', { query: { ...filtros, formato: 'xlsx' } }),
        onSuccess: ({ archivo, nombre }) => {
            guardarArchivo(archivo, nombre);
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo exportar la bitácora', detalle: error.message });
        },
    });
    return { exportar: exportar.mutate, exportando: exportar.isPending };
}
