import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

const source = (pkg: string): string =>
  fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url));

/**
 * One suite for the whole workspace. The interesting tests span it by nature --
 * backend parity compares the two renderer packages against each other, over
 * the example specs the playground ships -- so there is nothing to gain from a
 * per-package runner.
 */
export default defineConfig({
  resolve: {
    // The sources, not the built `dist`: the tests are the library's tests, and
    // should not be able to pass against a stale build.
    alias: [
      {find: /^@unit-vis\/core$/, replacement: source('core')},
      {find: /^unit-vis$/, replacement: source('unit-vis')},
      {find: /^unit-vis-vega$/, replacement: source('unit-vis-vega')},
    ],
  },
  test: {
    // Both backends draw into a document: the d3 one through d3-selection, the
    // vega one through vega's svg renderer.
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    // Vega dataflow over the full titanic set is not fast.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
