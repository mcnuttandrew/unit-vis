// Regenerates the JSON schema from packages/core/src/types.ts, which is the
// source of truth for the grammar: every description in the schema comes from a
// jsdoc comment on a type there. Run with `yarn schema`.
//
// The schema lands in two places -- beside the types in @unit-vis/core, which
// exports it as `@unit-vis/core/schema` for the playground's editor to lint
// against, and in the playground's public/, where vite serves it as the url
// specs point their `$schema` at.

import {writeFileSync} from 'fs';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';
import * as TJS from 'typescript-json-schema';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'packages/core/src/types.ts');

const program = TJS.getProgramFromFiles([source], {
  strictNullChecks: false,
  skipLibCheck: true,
});

// `*` keeps the internal container/layout structures in the output alongside
// the authoring types, matching what the old shell script emitted.
const schema = TJS.generateSchema(program, '*', {ignoreErrors: true}, [source]);

// typescript-json-schema has no notion of an entry point, so point the document
// at the type a spec actually is.
schema.$ref = '#/definitions/Spec';

const json = `${JSON.stringify(schema, null, 2)}\n`;
for (const target of ['packages/core/unit-vis-schema.json', 'apps/playground/public/unit-vis-schema.json']) {
  writeFileSync(resolve(root, target), json);
  console.log(`wrote ${target}`);
}
