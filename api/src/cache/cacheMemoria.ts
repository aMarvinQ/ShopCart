/*
    Caché en memoria con vencimiento y tope de entradas (D78), para los reportes.
    - Tope: al llegar al máximo se descarta la entrada usada hace más tiempo (LRU con el orden
      de inserción del Map), así la memoria nunca crece sin límite.
    - Peticiones simultáneas por la misma clave comparten una sola consulta a la base.
    - Integridad: invalidar() descarta también las consultas en curso; un resultado que empezó
      a calcularse antes del cambio no queda guardado para las peticiones siguientes.
    - Un error no se guarda: la siguiente petición vuelve a consultar.
*/
interface Entrada<T> {
    valor: Promise<T>;
    expira: number;
}

export interface ResultadoCache<T> {
    valor: T;
    /** true si vino del caché (o de una consulta en curso de otra petición). */
    desdeCache: boolean;
}

export class CacheMemoria<T> {
    private readonly entradas = new Map<string, Entrada<T>>();

    constructor(
        private readonly vigenciaMs: number,
        private readonly maximo: number,
        private readonly ahora: () => number = Date.now,
    ) {}

    async obtener(clave: string, calcular: () => Promise<T>): Promise<ResultadoCache<T>> {
        const entrada = this.entradas.get(clave);
        if (entrada && entrada.expira > this.ahora()) {
            // Usada recién: pasa al final del orden (la última en descartarse).
            this.entradas.delete(clave);
            this.entradas.set(clave, entrada);
            return { valor: await entrada.valor, desdeCache: true };
        }

        const valor = calcular();
        this.guardar(clave, { valor, expira: this.ahora() + this.vigenciaMs });
        try {
            return { valor: await valor, desdeCache: false };
        } catch (error) {
            if (this.entradas.get(clave)?.valor === valor) this.entradas.delete(clave);
            throw error;
        }
    }

    /** Descarta todo: lo llaman los avisos de negocio. */
    invalidar(): void {
        this.entradas.clear();
    }

    get tamano(): number {
        return this.entradas.size;
    }

    private guardar(clave: string, entrada: Entrada<T>): void {
        this.entradas.delete(clave);
        while (this.entradas.size >= this.maximo) {
            const masAntigua = this.entradas.keys().next().value;
            if (masAntigua === undefined) break;
            this.entradas.delete(masAntigua);
        }
        this.entradas.set(clave, entrada);
    }
}
