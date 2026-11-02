/*
    Error con significado para el cliente: estado HTTP, código estable (el mismo de
    docs/errores.md, con el que el frontend arma su mensaje) y una descripción.
*/
export class ErrorApi extends Error {
    constructor(
        readonly estado: number,
        readonly codigo: string,
        mensaje: string,
        readonly detalles?: unknown,
    ) {
        super(mensaje);
        this.name = 'ErrorApi';
    }
}
