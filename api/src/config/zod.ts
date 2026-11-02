import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Mensajes de validación en español para toda la API (configuración y datos de entrada).
z.config(z.locales.es());
// Los mismos esquemas que validan generan la documentación OpenAPI (.openapi()).
extendZodWithOpenApi(z);

export { z };
