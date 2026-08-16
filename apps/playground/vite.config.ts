import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const source = (pkg: string): string =>
  fileURLToPath(new URL(`../../packages/${pkg}/src/index.ts`, import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Point the workspace packages at their TypeScript sources rather than at
    // their built `dist`, so working on the library is a hot reload rather than
    // a rebuild. The patterns are anchored, which leaves subpath imports
    // (`@unit-vis/core/schema`) to resolve through the package's own exports.
    alias: [
      {find: /^@unit-vis\/core$/, replacement: source('core')},
      {find: /^unit-vis$/, replacement: source('unit-vis')},
      {find: /^unit-vis-vega$/, replacement: source('unit-vis-vega')},
    ],
  },
});
