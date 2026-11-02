import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
        setupFiles: ['tests/configurar.ts'],
        // Las pruebas de integración comparten la base de pruebas: se ejecutan en serie.
        fileParallelism: false,
    },
});
