const QUETZALES = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Formato de moneda del proyecto: Q1,234.50 */
export const moneda = (valor: number): string => `Q${QUETZALES.format(valor)}`;
