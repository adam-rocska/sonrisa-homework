import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/lib/**', '**/node_modules/**', '**/.plasmo/**', '**/build/**'] },
  js.configs.recommended, ...ts.configs.recommended,
  { files: ['**/*.ts', '**/*.tsx'], rules: { '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }], '@typescript-eslint/no-explicit-any': 'error', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }
);
