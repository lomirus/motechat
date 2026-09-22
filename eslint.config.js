import tsParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';

const rules = {
  semi: ['error', 'always'],
};

export default [
  {
    ignores: ['dist/**'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
    languageOptions: {
      parser: tsParser,
    },
    rules,
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
    },
    rules,
  },
];
