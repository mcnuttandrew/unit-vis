import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    // Both backends draw into a document: the old one through d3-selection, the
    // new one through vega-embed's svg renderer.
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    // Vega dataflow over the full titanic set is not fast.
    testTimeout: 60000,
    hookTimeout: 60000,
    server: {
      deps: {
        // Ships extensionless ESM imports ("./features/completion"), which
        // vite's resolver handles for the browser but node's does not.
        inline: ['codemirror-json-schema'],
      },
    },
  },
});
