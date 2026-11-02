import { z } from 'zod';

// Mensajes de validación en español para toda la API (configuración y datos de entrada).
z.config(z.locales.es());

export { z };
