// Lint rules for the whole repo. Run `npm run lint` (CI fails on errors, not warnings).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'playwright-report/**', 'test-results/**', '**/*.config.{js,cjs}'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // TypeScript's own noUnusedLocals/noUnusedParameters already catch these
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    files: ['apps/api/**/*.ts', 'prisma/**/*.ts', 'e2e/**/*.ts', '*.config.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Seed and tests print progress on purpose
    files: ['prisma/**/*.ts', '**/tests/**/*.ts', '**/*.test.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },
);
