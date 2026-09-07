import js from '@eslint/js'
import prettierConfig from 'eslint-config-prettier/flat'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const jsFiles = ['**/*.{js,cjs,mjs}']
const tsFiles = ['**/*.{ts,cts,mts}']
const sourceFiles = ['**/*.{js,cjs,mjs,ts,cts,mts}']

const qualityRules = {
  curly: ['error', 'all'],
  eqeqeq: ['error', 'always'],
  'no-console': 'error',
  'no-else-return': 'error',
  'no-var': 'error',
  'no-warning-comments': ['error', { terms: ['fixme'], location: 'start' }],
  'object-shorthand': ['error', 'always'],
  'prefer-const': 'error',
}

export default defineConfig([
  {
    name: 'template/linter-options',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  globalIgnores(['dist', '.context']),
  {
    name: 'template/javascript',
    files: jsFiles,
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.node,
      sourceType: 'module',
    },
  },
  {
    name: 'template/typescript',
    files: tsFiles,
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Prefer union literal types over enums.',
        },
      ],
      'no-undef': 'off',
    },
  },
  {
    ...prettierConfig,
    name: 'template/prettier',
  },
  {
    name: 'template/source-quality',
    files: sourceFiles,
    rules: {
      ...qualityRules,
    },
  },
])
