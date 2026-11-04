import { CircleAlert, RotateCw } from 'lucide-react';

/** Error con mensaje claro, acción para reintentar y referencia para soporte. */
export function EstadoError({
    titulo,
    mensaje,
    referencia,
    alReintentar,
}: {
    titulo: string;
    mensaje: string;
    referencia?: string | undefined;
    alReintentar?: (() => void) | undefined;
}) {
    return (
        <div role="alert" className="text-center py-5">
            <CircleAlert size={48} className="text-danger mb-3" aria-hidden="true" />
            <h2 className="h4">{titulo}</h2>
            <p className="text-secondary">{mensaje}</p>
            {alReintentar && (
                <button type="button" className="btn btn-primary" onClick={alReintentar}>
                    <RotateCw size={18} className="me-2" aria-hidden="true" />
                    Reintentar
                </button>
            )}
            {referencia && <p className="small text-secondary mt-3 mb-0">Ref.: {referencia}</p>}
        </div>
    );
}
