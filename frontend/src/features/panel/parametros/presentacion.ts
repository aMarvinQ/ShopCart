/*
    Cómo se presenta cada parámetro: título, grupo y unidad. Es solo presentación; la regla
    (tipo y rango) viene de la API. Una clave nueva sin entrada aquí se muestra con su clave
    y su descripción en "Otros".
*/
export const GRUPOS = ['Carrito y pagos', 'Inventario', 'Devoluciones', 'Seguridad', 'Otros'] as const;
export type Grupo = (typeof GRUPOS)[number];

interface Presentacion {
    titulo: string;
    grupo: Grupo;
    /** En plural; se muestra junto al campo y en el rango. */
    unidad?: string;
    nota?: string;
}

const PRESENTACION: Record<string, Presentacion> = {
    MINUTOS_RESERVA: { titulo: 'Tiempo de reserva al pagar', grupo: 'Carrito y pagos', unidad: 'minutos' },
    HORAS_CARRITO_ABANDONADO: { titulo: 'Carrito abandonado después de', grupo: 'Carrito y pagos', unidad: 'horas' },
    MAXIMO_UNIDADES_POR_LINEA: {
        titulo: 'Unidades máximas por producto',
        grupo: 'Carrito y pagos',
        unidad: 'unidades',
    },
    TASA_IVA: { titulo: 'Tasa de IVA', grupo: 'Carrito y pagos' },
    EXISTENCIA_MINIMA: { titulo: 'Alerta de existencia baja', grupo: 'Inventario', unidad: 'unidades' },
    DIAS_DEVOLUCION: { titulo: 'Plazo para solicitar devolución', grupo: 'Devoluciones', unidad: 'días' },
    SESION_DIAS_INACTIVIDAD: {
        titulo: 'Cierre de sesión por inactividad',
        grupo: 'Seguridad',
        unidad: 'días',
        nota: 'No puede superar la duración máxima de la sesión.',
    },
    SESION_DIAS_MAXIMO: {
        titulo: 'Duración máxima de la sesión',
        grupo: 'Seguridad',
        unidad: 'días',
        nota: 'No puede ser menor que el cierre por inactividad.',
    },
    SESION_SEGUNDOS_GRACIA: { titulo: 'Margen al renovar la sesión', grupo: 'Seguridad', unidad: 'segundos' },
};

export const presentacionDe = (clave: string): Presentacion => PRESENTACION[clave] ?? { titulo: clave, grupo: 'Otros' };
