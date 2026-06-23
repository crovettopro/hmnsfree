import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

/**
 * Pragmatic flat config for an existing ~8k-LOC monorepo that had no linter.
 * Goal: catch real mistakes (unused symbols, unsafe comparisons, floating
 * intent) without flooding on deliberate patterns (the machine plane uses `any`
 * for untyped request bodies on purpose). Non-type-checked rules only — fast
 * enough to run on every change. Prettier owns formatting (config last).
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'apps/web/public/**',
      'apps/studio/.revoice/**',
      '_pruebas/**',
      '_assets/**',
      'out/**',
      'content/**',
      '**/*.config.{js,mjs,ts}',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The machine plane parses untyped JSON bodies; `any` there is intentional.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow deliberately-unused args/vars when prefixed with _ (signature shims).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Empty catch is a valid "best-effort, ignore failure" idiom used widely here.
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-empty-function': 'off',
      // `as` narrowing on parsed JSON / DOM is common and reviewed.
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    // The web app is React: catch hook misuse (rules-of-hooks is non-negotiable;
    // exhaustive-deps stays a warning so deliberate omissions can be // -disabled).
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  prettier,
)
