import { Upload } from 'lucide-react';
import { useId, useRef } from 'react';
import { Esqueleto } from '../../../../ui/Esqueleto';
import { Alerta } from '../../../../ui/Mensajes';
import { useSubirImagenes } from './hooks/useSubirImagenes';
import estilos from './productos.module.scss';

/** Botón de subir y, mientras llegan, un cuadro gris por imagen en el lugar donde aparecerá. */
export function SubidorImagenes({ alSubir }: { alSubir: (rutas: string[]) => void }) {
    const id = useId();
    const entrada = useRef<HTMLInputElement>(null);
    const { elegir, subiendo, error } = useSubirImagenes(alSubir);
    return (
        <>
            {Array.from({ length: subiendo }, (_, i) => (
                <div key={i} className={estilos.imagen} role="status" aria-label="Subiendo imagen">
                    <Esqueleto alto="100%" radio="6px" />
                </div>
            ))}
            <label htmlFor={id} className={estilos.subir}>
                <Upload size={20} aria-hidden="true" />
                Subir imagen
                <input
                    ref={entrada}
                    id={id}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="visually-hidden"
                    onChange={({ target }) => {
                        elegir(target.files);
                        if (entrada.current) entrada.current.value = '';
                    }}
                />
            </label>
            {error && (
                <div className={estilos.errorImagen}>
                    <Alerta tipo="error">{error}</Alerta>
                </div>
            )}
        </>
    );
}
