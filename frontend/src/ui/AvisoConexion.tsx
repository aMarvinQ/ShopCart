import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';

function suscribir(avisar: () => void): () => void {
    window.addEventListener('online', avisar);
    window.addEventListener('offline', avisar);
    return () => {
        window.removeEventListener('online', avisar);
        window.removeEventListener('offline', avisar);
    };
}

/** Franja visible mientras el navegador no tiene conexión. */
export function AvisoConexion() {
    const enLinea = useSyncExternalStore(suscribir, () => navigator.onLine);
    if (enLinea) return null;
    return (
        <div role="status" className="alert alert-warning rounded-0 mb-0 py-2 text-center">
            <WifiOff size={18} className="me-2" aria-hidden="true" />
            Sin conexión a internet. Lo que ya cargaste sigue visible.
        </div>
    );
}
