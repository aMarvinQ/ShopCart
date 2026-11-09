import { useMutation } from '@tanstack/react-query';
import { api } from '../../../../api/cliente';
import { useAvisos } from '../../../../ui/avisos/contexto';
import { guardarArchivo } from '../../../../utils/descargas';

export type Formato = 'xlsx' | 'pdf';

/** Reporte de ventas del periodo (indicadores, por día, por categoría, top 10 y existencia baja). */
export function useExportarReporte(rango: { fechaDesde: string; fechaHasta: string }) {
    const avisar = useAvisos();
    const exportar = useMutation({
        mutationFn: (formato: Formato) =>
            api.descargar('/reportes/exportar', { query: { ...rango, agrupacion: 'DIA', formato } }),
        onSuccess: ({ archivo, nombre }) => {
            guardarArchivo(archivo, nombre);
        },
        onError: (error) => {
            avisar({ tipo: 'error', titulo: 'No se pudo exportar el reporte', detalle: error.message });
        },
    });
    return { exportar: exportar.mutate, exportando: exportar.isPending };
}
