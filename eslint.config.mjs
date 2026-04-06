import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import sveltePlugin from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

const eslintRecommendedRules = Object.fromEntries(
  [...builtinRules.entries()]
    .filter(([, rule]) => rule.meta?.docs?.recommended)
    .map(([ruleName]) => [ruleName, 'error']),
);

const tsEslintRecommendedCompatRules = tsPlugin.configs['eslint-recommended'].overrides[0].rules;

const tsRecommendedRules = tsPlugin.configs.recommended.rules;

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.{js,mjs,cjs,ts,mts,cts}', 'web/src/**/*.{js,mjs,cjs,ts,mts,cts,svelte}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      svelte: sveltePlugin,
    },
    rules: {
      ...eslintRecommendedRules,
      ...tsRecommendedRules,
    },
  },
  {
    files: ['src/**/*.{ts,mts,cts}', 'web/src/**/*.{ts,mts,cts}'],
    rules: {
      ...tsEslintRecommendedCompatRules,
    },
  },
  {
    files: ['web/src/**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.svelte'],
      },
    },
  },
]);
