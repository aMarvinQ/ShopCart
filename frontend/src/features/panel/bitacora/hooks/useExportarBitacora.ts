import { useMutation } from '@tanstack/react-query';
import { api } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import type { useBitacora } from './useBitacora';

type FiltrosApi = ReturnType<typeof useBitacora>['filtrosApi'];

/** Entrega un archivo al navegador como descarga y libera la memoria del enlace temporal. */
function guardarArchivo(archivo: Blob, nombre: string) {
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.click();
    // Se libera después: la descarga ya tomó el archivo.
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 0);
}

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
