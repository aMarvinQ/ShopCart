/*
    Lector de Server-Sent Events. EventSource no permite enviar el token en una cabecera, así
    que el flujo se lee con fetch y se interpreta aquí. Los trozos de la red pueden cortar un
    evento por la mitad: lo incompleto se guarda hasta que llegue la línea en blanco que lo cierra.
*/
export interface EventoSse {
    evento: string;
    datos: string;
}

export function crearLectorSse() {
    let pendiente = '';

    return (trozo: string): EventoSse[] => {
        pendiente += trozo.replace(/\r\n?/g, '\n');
        const bloques = pendiente.split('\n\n');
        pendiente = bloques.pop() ?? '';

        return bloques.flatMap((bloque) => {
            let evento = 'message';
            const datos: string[] = [];
            for (const linea of bloque.split('\n')) {
                if (linea.startsWith(':')) continue; // comentario: el latido
                const separador = linea.indexOf(':');
                const campo = separador === -1 ? linea : linea.slice(0, separador);
                const valor = separador === -1 ? '' : linea.slice(separador + 1).replace(/^ /, '');
                if (campo === 'event') evento = valor;
                else if (campo === 'data') datos.push(valor);
            }
            return datos.length > 0 ? [{ evento, datos: datos.join('\n') }] : [];
        });
    };
}
