/**
 * Converts the example specs in `src/specs` from TypeScript modules to plain
 * JSON documents, so they can be read, diffed, and edited as data rather than
 * as code.
 *
 *   yarn specs:json              # convert, deleting the .ts sources
 *   yarn specs:json --dry-run    # print what would happen, write nothing
 *   yarn specs:json --keep-ts    # write the .json but leave the .ts in place
 *
 * This is a one-shot migration: once the `.ts` specs are gone there is nothing
 * left to convert and the script reports as much. It stays in the tree so the
 * conversion is reproducible and so a spec authored as TS by mistake has an
 * obvious way home.
 */
import {rmSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import type {Spec} from '../library/index.d';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keepTs = args.includes('--keep-ts');

const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');
const specsDir = join(repoRoot, 'src/specs');

// Eager rather than lazy: the glob is resolved at transform time, which is what
// lets a script running under vite-node import TypeScript spec modules at all.
const modules = import.meta.glob<{default?: Spec}>('../src/specs/*.ts', {eager: true});

/**
 * `$schema` is written last in the TS sources, where it reads as a trailing
 * annotation. In a JSON document it is the conventional first key -- it is what
 * an editor keys off to offer completions for the rest of the file.
 */
function hoistSchema(spec: Spec): Record<string, unknown> {
  const {$schema, ...rest} = spec as Spec & {$schema?: string};
  return $schema === undefined ? {...rest} : {$schema, ...rest};
}

const entries = Object.entries(modules)
  .map(([path, mod]) => ({name: basename(path, '.ts'), spec: mod.default}))
  // `index.ts` is the barrel, not a spec, and it has no default export.
  .filter((entry): entry is {name: string; spec: Spec} => Boolean(entry.spec))
  .sort((a, b) => a.name.localeCompare(b.name));

if (!entries.length) {
  console.log(`No TypeScript specs found in ${specsDir} -- nothing to convert.`);
  process.exit(0);
}

for (const {name, spec} of entries) {
  const jsonPath = join(specsDir, `${name}.json`);
  const tsPath = join(specsDir, `${name}.ts`);
  const text = `${JSON.stringify(hoistSchema(spec), null, 2)}\n`;

  if (dryRun) {
    console.log(`would write ${name}.json (${text.length} bytes)${keepTs ? '' : ` and delete ${name}.ts`}`);
    continue;
  }

  writeFileSync(jsonPath, text);
  if (!keepTs) {
    rmSync(tsPath);
  }
  console.log(`${name}.ts -> ${name}.json`);
}

console.log(
  `\n${dryRun ? 'Would convert' : 'Converted'} ${entries.length} spec${entries.length === 1 ? '' : 's'}.`,
);
