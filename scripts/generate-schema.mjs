// Regenerates the JSON schema from library/index.d.ts, which is the source of
// truth for the grammar: every description in the schema comes from a jsdoc
// comment on a type there. Run with `yarn schema`.
//
// The schema lands in two places -- the repo root, where the editor imports it,
// and public/, where vite serves it as the url specs point their `$schema` at.

import {writeFileSync} from 'fs';
import {dirname, resolve} from 'path';
import {fileURLToPath} from 'url';
import * as TJS from 'typescript-json-schema';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'library/index.d.ts');

const program = TJS.getProgramFromFiles([source], {
  strictNullChecks: false,
  skipLibCheck: true,
});

// `*` keeps the internal container/layout structures in the output alongside
// the authoring types, matching what the old shell script emitted. The file
// list has to be passed through: left to itself the generator skips `.d.ts`
// files when collecting types, which is every type we have.
const schema = TJS.generateSchema(program, '*', {ignoreErrors: true}, [source]);

// typescript-json-schema has no notion of an entry point, so point the document
// at the type a spec actually is.
schema.$ref = '#/definitions/Spec';

const json = `${JSON.stringify(schema, null, 2)}\n`;
for (const target of ['unit-vis-schema.json', 'public/unit-vis-schema.json']) {
  writeFileSync(resolve(root, target), json);
  console.log(`wrote ${target}`);
}
