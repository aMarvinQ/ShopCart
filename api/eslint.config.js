// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'coverage', 'node_modules', 'uploads', 'seed-assets'] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: { allowDefaultProject: ['*.js', 'scripts/*.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Todo acceso a datos es por stored procedures: prohibido enviar SQL desde la API.
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'CallExpression[callee.property.name=/^(query|batch)$/]',
                    message:
                        'Prohibido ejecutar SQL directo: usa ejecutarProcedimiento() con un SP de la lista blanca.',
                },
            ],
            // Solo la capa db/ habla con el driver.
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        {
                            name: 'mssql',
                            message: 'Solo src/db/ usa mssql; los repositorios llaman a ejecutarProcedimiento().',
                        },
                    ],
                },
            ],
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        },
    },
    {
        files: ['src/db/**/*.ts'],
        rules: { 'no-restricted-imports': 'off' },
    },
    {
        files: ['scripts/**/*.mjs', '*.js'],
        ...tseslint.configs.disableTypeChecked,
        languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } },
    },
);
