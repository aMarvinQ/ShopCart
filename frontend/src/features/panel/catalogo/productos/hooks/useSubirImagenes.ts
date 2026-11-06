import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../../../../api/cliente';

const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAXIMO_BYTES = 5 * 1024 * 1024;
const MAXIMO_POR_ENVIO = 10;

/** Paso 1: sube los archivos y devuelve sus rutas. Avisa antes de enviar lo que la API va a rechazar. */
export function useSubirImagenes(alSubir: (rutas: string[]) => void) {
    const [error, setError] = useState<string | null>(null);
    const subir = useMutation({
        mutationFn: (archivos: File[]) => {
            const cuerpo = new FormData();
            for (const archivo of archivos) cuerpo.append('archivos', archivo);
            return api.post('/imagenes', { cuerpo });
        },
        onSuccess: ({ data }) => {
            alSubir(data.rutas);
        },
        onError: (e) => {
            setError(e.message);
        },
    });
    return {
        error,
        subiendo: subir.isPending ? subir.variables.length : 0,
        elegir: (lista: FileList | null) => {
            const archivos = [...(lista ?? [])];
            if (archivos.length === 0) return;
            if (archivos.length > MAXIMO_POR_ENVIO) {
                setError(`Sube hasta ${String(MAXIMO_POR_ENVIO)} imágenes a la vez.`);
            } else if (archivos.some((a) => !TIPOS.has(a.type))) {
                setError('Solo se aceptan imágenes JPEG, PNG o WebP.');
            } else if (archivos.some((a) => a.size > MAXIMO_BYTES)) {
                setError('Cada imagen debe pesar hasta 5 MB.');
            } else {
                setError(null);
                subir.mutate(archivos);
            }
        },
    };
}
