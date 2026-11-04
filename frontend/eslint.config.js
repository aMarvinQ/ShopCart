// @ts-check
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'coverage', 'node_modules', 'playwright-report', 'test-results', 'src/api/esquema.d.ts'] },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    jsxA11y.flatConfigs.recommended,
    {
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: { allowDefaultProject: ['*.js', 'scripts/*.mjs'] },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
        rules: {
            // Un efecto sin limpieza o con dependencias incompletas es la fuente típica de fugas.
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
            // Nada de HTML inyectado: los textos siempre pasan por el escape de React.
            'no-restricted-syntax': [
                'error',
                {
                    selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
                    message: 'Prohibido inyectar HTML: se muestra como texto.',
                },
                {
                    selector:
                        "MemberExpression[object.name='localStorage'][property.name='setItem'][parent.arguments.0.value=/token/i]",
                    message: 'Los tokens nunca se guardan en localStorage.',
                },
            ],
            'no-console': ['error', { allow: ['warn', 'error'] }],
        },
    },
    {
        files: ['scripts/**', '*.config.*', 'tests/**'],
        languageOptions: { globals: globals.node },
        rules: { 'no-console': 'off' },
    },
    {
        // JavaScript sin tipos: las reglas que dependen de ellos no aplican.
        files: ['**/*.{js,mjs}'],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        // Las pruebas pueden usar lo que comprueban.
        files: ['**/*.test.{ts,tsx}', 'tests/**', 'src/pruebas/**'],
        rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
    },
);
