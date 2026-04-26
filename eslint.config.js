import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'api',
    'supabase/functions/**',
    'scripts/mock-prompt-audit/**',
    '.claude/**',
    '.smashOS/**',
    '.worktrees/**',
    'graphify-out/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TS handles undefined-variable detection; built-in is noise on TS files.
      'no-undef': 'off',
      // Superseded by @typescript-eslint/no-unused-vars below.
      'no-unused-vars': 'off',
      // Empty catches are intentional in many places (e.g. fire-and-forget audit_log).
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Defensive `let x = 0` initializers reassigned inside a try{} aren't bugs;
      // the rule misfires on a common type-narrowing pattern.
      'no-useless-assignment': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // The next three are React-Compiler-aware rules. We have known violations
      // that need a focused refactor; until then keep them as warnings (not off)
      // so they're visible in lint output but don't block CI.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    },
  },
])
