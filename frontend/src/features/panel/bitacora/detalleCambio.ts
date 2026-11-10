import { fechaHora, moneda } from '../../../utils/formato';

/*
    Convierte el JSON que guarda la bitácora (valor anterior y nuevo, con las columnas de la
    tabla como claves, en camelCase como las entrega la API) en texto legible. Funciones puras: no saben de React ni de la API.
*/
export type ValorJson = Record<string, unknown> | null;

export interface CampoCambiado {
    campo: string;
    etiqueta: string;
    /** undefined: el campo no estaba (creación o dato de contexto, como la cantidad de un movimiento). */
    anterior: string | undefined;
    nuevo: string | undefined;
}

const ETIQUETAS: Record<string, string> = {
    activo: 'Activo',
    apellido: 'Apellido',
    cantidad: 'Cantidad',
    codigo: 'Código',
    codigoHex: 'Color',
    codigoRol: 'Rol',
    comentario: 'Comentario',
    correo: 'Correo',
    costo: 'Costo',
    descripcion: 'Descripción',
    diasEstimadosMax: 'Días máximos',
    diasEstimadosMin: 'Días mínimos',
    estado: 'Estado',
    existencia: 'Existencia',
    existenciaFisica: 'Existencia',
    fechaFin: 'Fin',
    fechaInicio: 'Inicio',
    limiteUsosPorCliente: 'Límite por cliente',
    limiteUsosTotal: 'Límite de usos',
    montoMinimo: 'Monto mínimo',
    motivo: 'Motivo',
    nombre: 'Nombre',
    orden: 'Orden',
    precio: 'Precio',
    sesionesRevocadas: 'Sesiones cerradas',
    sku: 'SKU',
    slug: 'Slug',
    soloRegistrados: 'Solo registrados',
    telefono: 'Teléfono',
    textoAlternativo: 'Texto alternativo',
    tipoDescuento: 'Tipo de descuento',
    tipoMovimiento: 'Tipo de movimiento',
    valor: 'Valor',
};

/* Códigos que se guardan en mayúsculas y tienen nombre propio. */
const CODIGOS: Record<string, string> = {
    PAGADO: 'Pagado',
    EN_PREPARACION: 'En preparación',
    ENVIADO: 'Enviado',
    ENTREGADO: 'Entregado',
    CANCELADO: 'Cancelado',
    DEVUELTO_PARCIAL: 'Devuelto parcial',
    DEVUELTO: 'Devuelto',
    PORCENTAJE: 'Porcentaje',
    MONTO_FIJO: 'Monto fijo',
    ENTRADA_COMPRA: 'Entrada por compra',
    AJUSTE_ENTRADA: 'Ajuste de entrada',
    AJUSTE_SALIDA: 'Ajuste de salida',
    INVENTARIO_INICIAL: 'Inventario inicial',
    SALIDA_VENTA: 'Venta',
    CANCELACION: 'Cancelación',
    DEVOLUCION: 'Devolución',
    ADMIN: 'Administrador',
    OPERADOR: 'Operador',
    CLIENTE: 'Cliente',
};

const MONEDA = new Set(['precio', 'costo', 'montoMinimo']);
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** "diasEstimadosMin" → "Dias estimados min", para claves que no están en la lista. */
const separar = (clave: string) => {
    const palabras = clave.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return palabras.charAt(0).toUpperCase() + palabras.slice(1);
};

export const etiquetaCampo = (clave: string) => ETIQUETAS[clave] ?? separar(clave);

export function textoValor(clave: string, valor: unknown): string {
    if (valor === null || valor === undefined || valor === '') return '—';
    if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
    if (typeof valor === 'number') return MONEDA.has(clave) ? moneda(valor) : valor.toLocaleString('en-US');
    if (typeof valor === 'string') {
        // Las fechas se guardan en UTC sin zona.
        if (FECHA_ISO.test(valor)) return fechaHora(valor.endsWith('Z') ? valor : `${valor}Z`);
        return CODIGOS[valor] ?? valor;
    }
    if (Array.isArray(valor)) return `${String(valor.length)} ${valor.length === 1 ? 'elemento' : 'elementos'}`;
    return JSON.stringify(valor);
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const vacio = (valor: unknown) => valor === null || valor === undefined || valor === '';

/*
    Campos que cambiaron. En una creación (sin anterior) se listan los datos nuevos sin los IDs
    técnicos. Los campos que solo están en el nuevo (contexto, como la cantidad de un movimiento)
    se incluyen sin valor anterior.
*/
export function camposCambiados(anterior: ValorJson, nuevo: ValorJson): CampoCambiado[] {
    const claves = [...new Set([...Object.keys(anterior ?? {}), ...Object.keys(nuevo ?? {})])];
    return (
        claves
            .filter((clave) => !(anterior === null && /^id[A-Z]/.test(clave)))
            .filter((clave) => anterior === null || !igual(anterior[clave], nuevo?.[clave]))
            // Un dato de contexto vacío (como un comentario sin escribir) no dice nada.
            .filter((clave) => !(anterior !== null && !(clave in anterior) && vacio(nuevo?.[clave])))
            .map((clave) => ({
                campo: clave,
                etiqueta: etiquetaCampo(clave),
                anterior: anterior && clave in anterior ? textoValor(clave, anterior[clave]) : undefined,
                nuevo: nuevo && clave in nuevo ? textoValor(clave, nuevo[clave]) : undefined,
            }))
    );
}

const frase = ({ etiqueta, anterior, nuevo }: CampoCambiado) =>
    anterior === undefined
        ? `${etiqueta}: ${nuevo ?? '—'}`
        : nuevo === undefined
          ? `${etiqueta}: ${anterior} (quitado)`
          : `${etiqueta}: ${anterior} → ${nuevo}`;

/** Una línea para la tabla: los primeros campos y cuántos más hay. */
export function resumenCambio(anterior: ValorJson, nuevo: ValorJson, maximo = 2): string {
    const campos = camposCambiados(anterior, nuevo);
    if (campos.length === 0) return 'Sin cambios en los datos';
    const visibles = campos.slice(0, maximo).map(frase).join(' · ');
    return campos.length > maximo ? `${visibles} · +${String(campos.length - maximo)} más` : visibles;
}

const ENTIDADES: Record<string, string> = {
    Atributo: 'Atributo',
    AtributoValor: 'Valor de atributo',
    Categoria: 'Categoría',
    Cupon: 'Cupón',
    MetodoEnvio: 'Método de envío',
    Parametro: 'Parámetro',
    Pedido: 'Pedido',
    Producto: 'Producto',
    ProductoImagen: 'Imagen',
    Usuario: 'Usuario',
    Variante: 'Variante',
};

export const etiquetaEntidad = (entidad: string) => ENTIDADES[entidad] ?? separar(entidad);

/** El nombre más reconocible del registro, si el JSON lo trae: código, SKU, nombre (con apellido) o correo. */
export function nombreRegistro(anterior: ValorJson, nuevo: ValorJson): string | null {
    const texto = (clave: string) => {
        const valor = nuevo?.[clave] ?? anterior?.[clave];
        return typeof valor === 'string' && valor ? valor : null;
    };
    const nombre = texto('nombre');
    const apellido = texto('apellido');
    return (
        texto('codigo') ?? texto('sku') ?? (nombre && apellido ? `${nombre} ${apellido}` : nombre) ?? texto('correo')
    );
}
