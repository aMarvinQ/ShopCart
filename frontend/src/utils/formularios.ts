import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { esErrorApi } from '../api/errores';

/**
 * Coloca en sus campos los errores de validación que devolvió la API y dice qué mensaje mostrar
 * arriba del formulario; null si todo quedó señalado en los campos.
 */
export function aplicarErroresApi<T extends FieldValues>(
    error: unknown,
    setError: UseFormSetError<T>,
    campos: readonly Path<T>[],
    mensajePorDefecto: string,
): string | null {
    if (!esErrorApi(error)) return mensajePorDefecto;
    const propios = error.detalles.filter(({ campo }) => (campos as readonly string[]).includes(campo));
    for (const { campo, mensaje } of propios) setError(campo as Path<T>, { message: mensaje });
    return propios.length > 0 ? null : error.message;
}
