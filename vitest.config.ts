import { defineConfig } from 'vitest/config'

/**
 * Root test runner for the monorepo. Tests are co-located next to source as
 * `*.test.ts`. Node environment by default (the engine, edge and shared packages
 * are server-side); web component tests opt into jsdom per-file via a
 * `// @vitest-environment jsdom` pragma.
 */
export default defineConfig({
  test: {
    include: ['{packages,apps}/**/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    globals: false,
    passWithNoTests: false,
  },
})
