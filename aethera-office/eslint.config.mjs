import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/coverage', '**/node_modules', '**/__fixtures__'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Awalan "_" = sengaja tidak dipakai.
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: ['apps/server/**/*.ts', 'packages/**/*.ts', '*.mjs'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
