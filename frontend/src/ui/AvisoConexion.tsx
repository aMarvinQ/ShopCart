import { useSyncExternalStore } from 'react';
import { Alerta } from './Mensajes';
import estilos from './AvisoConexion.module.scss';

function suscribir(avisar: () => void): () => void {
    window.addEventListener('online', avisar);
    window.addEventListener('offline', avisar);
    return () => {
        window.removeEventListener('online', avisar);
        window.removeEventListener('offline', avisar);
    };
}

/** Aviso flotante mientras el navegador no tiene conexión: no empuja la página. */
export function AvisoConexion() {
    const enLinea = useSyncExternalStore(suscribir, () => navigator.onLine);
    if (enLinea) return null;
    return (
        <div className={estilos.aviso}>
            <Alerta tipo="aviso">Sin conexión a internet. Lo que ya cargaste sigue visible.</Alerta>
        </div>
    );
}
