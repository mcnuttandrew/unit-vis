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

/**
 * Two descriptions for one place in the schema, joined for a single hover: the
 * one written on the property (what this field does here) followed by the one
 * written on its type (what the values mean). Identical text -- a property
 * that only refs a type, or a type only ever used once -- is not repeated.
 */
function joinDescriptions(own, inherited) {
  const parts = [own, inherited].filter(Boolean);
  return parts.length === 2 && own !== inherited ? parts.join('\n\n') : parts[0];
}

/**
 * Replaces every `$ref` with the definition it points at, so the document says
 * what it means at each location rather than pointing elsewhere.
 *
 * Two things go wrong when refs are left in place, both of them silent, and
 * both of them worst exactly where the grammar is most in need of explaining --
 * inside `layouts`:
 *
 *  - A ref under `items` stops a reader walking a path. The playground's editor
 *    (codemirror-json-schema, over json-schema-library) resolves the ref for
 *    the item itself but not for the walk that continues through it, so every
 *    path below `layouts/0` -- `subgroup.type`, `direction`, `size`, `sort`,
 *    all of it -- falls back to a schema inferred from the data, which carries
 *    no description, no enum and no default. That is the whole layout grammar
 *    hovering as a bare `string`.
 *  - A ref beside a description drops the description. `{$ref, description}` is
 *    resolved to the definition alone, so `direction`'s note about what it
 *    orders is replaced by the `Direction` type's own text, and `subgroup.type`
 *    loses its list of split rules entirely.
 *
 * Inlining fixes both at the source, for every consumer, rather than in the one
 * editor. The engine's own structures are left pointing: a `Container` holds
 * `Container`s and a `Layout` links to its neighbors, so inlining there does
 * not terminate, and copying the layout tree into every corner of it is most of
 * what the document would then weigh. Nothing in that half is written by hand,
 * so nothing there is hovered.
 */
function isInternal(node) {
  return typeof node?.description === 'string' && node.description.startsWith('Internal.');
}

function inlineRefs(node, stack) {
  if (Array.isArray(node)) {
    return node.map((entry) => inlineRefs(entry, stack));
  }
  if (!node || typeof node !== 'object') {
    return node;
  }

  const {$ref, ...siblings} = node;
  const inlinedSiblings = Object.fromEntries(
    Object.entries(siblings).map(([key, value]) => [key, inlineRefs(value, stack)]),
  );

  if (typeof $ref !== 'string') {
    return inlinedSiblings;
  }

  const name = $ref.replace('#/definitions/', '');
  const target = schema.definitions[name];
  if (!target || stack.includes(name) || isInternal(target) || isInternal(siblings)) {
    return {$ref, ...inlinedSiblings};
  }

  const inlined = inlineRefs(target, [...stack, name]);
  const description = joinDescriptions(siblings.description, inlined.description);
  // The siblings win on everything else: a `default` written on the property is
  // the one that applies there.
  return {...inlined, ...inlinedSiblings, ...(description ? {description} : {})};
}

// The root `$ref` is left alone -- it is the entry point, and inlining it would
// copy `Spec` over the `definitions` map it sits beside.
schema.definitions = Object.fromEntries(
  Object.entries(schema.definitions).map(([name, definition]) => [
    name,
    isInternal(definition) ? definition : inlineRefs(definition, [name]),
  ]),
);

const json = `${JSON.stringify(schema, null, 2)}\n`;
for (const target of ['packages/core/unit-vis-schema.json', 'apps/playground/public/unit-vis-schema.json']) {
  writeFileSync(resolve(root, target), json);
  console.log(`wrote ${target}`);
}
