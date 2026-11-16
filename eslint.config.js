import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'release', '.build', 'coverage', 'test-results', 'playwright-report', 'public']),
  {
    files: ['**/*.{ts,tsx,cts,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      complexity: ['warn', 10],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
])
