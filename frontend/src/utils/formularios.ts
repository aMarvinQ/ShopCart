import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { esErrorApi } from '../api/errores';

/**
 * Coloca en sus campos los errores de validación que devolvió la API y dice qué mensaje mostrar
 * arriba del formulario; null si todo quedó señalado en los campos. `prefijo` es para cuerpos
 * anidados: con "invitado.", el error de "invitado.linea1" va al campo "linea1". `porCodigo` lleva a un
 * campo los errores de negocio que no traen detalles, como SLUG_REGISTRADO.
 */
export function aplicarErroresApi<T extends FieldValues>(
    error: unknown,
    setError: UseFormSetError<T>,
    campos: readonly Path<T>[],
    mensajePorDefecto: string,
    prefijo = '',
    porCodigo: Partial<Record<string, Path<T>>> = {},
): string | null {
    if (!esErrorApi(error)) return mensajePorDefecto;
    const campoDelCodigo = porCodigo[error.codigo];
    if (campoDelCodigo) {
        setError(campoDelCodigo, { message: error.message });
        return null;
    }
    const propios = error.detalles
        .map(({ campo, mensaje }) => ({
            campo: campo.startsWith(prefijo) ? campo.slice(prefijo.length) : campo,
            mensaje,
        }))
        .filter(({ campo }) => (campos as readonly string[]).includes(campo));
    for (const { campo, mensaje } of propios) setError(campo as Path<T>, { message: mensaje });
    return propios.length > 0 ? null : error.message;
}
