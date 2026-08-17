/**
 * Copies the vega-datasets files the example specs reference into the
 * playground's `public/data`, which is both what vite serves and where the test
 * harness reads a spec's data from. Run with `yarn data:sync`.
 *
 * Every `data/<file>` a spec mentions is looked up in the installed
 * `vega-datasets` package -- a `data.url`, but also a picture a `mark.image`
 * points at, since both are written the same way. Anything the package does not
 * have (penguins.csv, titanic.csv, the specs' own data) is left where it is, so
 * this only ever adds what the package is the source of.
 */
import {copyFileSync, existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const specDir = join(root, 'specs');
const target = join(root, 'apps/playground/public/data');
const source = join(root, 'node_modules/vega-datasets/data');

if (!existsSync(source)) {
  throw new Error(`no vega-datasets at ${source} -- run \`yarn install\` first`);
}

/** Every `"data/<file>"` any spec names, whatever it names it for. */
const referenced = new Set<string>();
for (const spec of readdirSync(specDir).filter(name => name.endsWith('.json'))) {
  const text = readFileSync(join(specDir, spec), 'utf8');
  for (const [, file] of text.matchAll(/"data\/([\w.-]+)"/g)) {
    referenced.add(file);
  }
}

const copied: string[] = [];
const skipped: string[] = [];
for (const file of Array.from(referenced).sort()) {
  const from = join(source, file);
  if (!existsSync(from)) {
    skipped.push(file);
    continue;
  }
  const to = join(target, file);
  if (existsSync(to) && statSync(to).size === statSync(from).size) {
    continue;
  }
  copyFileSync(from, to);
  copied.push(file);
}

console.log(copied.length ? `copied ${copied.join(', ')}` : 'every referenced dataset is already in place');
if (skipped.length) {
  console.log(`not from vega-datasets, left alone: ${skipped.join(', ')}`);
}
