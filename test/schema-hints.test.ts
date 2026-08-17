/**
 * The schema as the editor reads it.
 *
 * Every hint the playground shows -- the hover text over a key, the completions
 * inside an object, the enum a value is checked against -- is looked up by
 * walking the schema alongside the document, one key at a time, from
 * codemirror-json-schema down into json-schema-library. That walk is what these
 * tests do: for every path in every bundled spec, ask the question the editor
 * asks, and require an answer.
 *
 * It is worth pinning because the failure is silent. A `$ref` the walk cannot
 * follow does not error -- json-schema-library falls back to a schema inferred
 * from the data, which is a plain `string` or `object` with no description, no
 * enum and no default. The whole of `layouts` hovered like that once, which is
 * every interesting field in the grammar.
 */
import {describe, expect, it} from 'vitest';
import {Draft04} from 'json-schema-library';

import schema from '../packages/core/unit-vis-schema.json';
import {ALL_SPECS} from './harness/specs';

// The same draft the hover extension instantiates, over the same document the
// playground imports as `@unit-vis/core/schema`.
const draft = new Draft04(schema as object);

/** Every json pointer into a spec, in document order, data rows excepted. */
function pointers(data: unknown, base = '#', out: string[] = []): string[] {
  if (data === null || typeof data !== 'object') {
    return out;
  }
  for (const key of Object.keys(data as object)) {
    const pointer = `${base}/${key}`;
    out.push(pointer);
    // `data.values` is rows of user data, which the schema describes as a whole
    // and cannot describe field by field.
    if (!base.startsWith('#/data')) {
      pointers((data as Record<string, unknown>)[key], pointer, out);
    }
  }
  return out;
}

function schemaAt(pointer: string, data: unknown): {description?: string; enum?: unknown[]} | undefined {
  return draft.getSchema({pointer, data, withSchemaWarning: true}) as never;
}

/**
 * One entry of a `domain` or `range` list. The list is documented; a single
 * string inside it has nothing of its own to say.
 */
const UNDOCUMENTED = /\/(domain|range)\/\d+$/;

describe('every path in the bundled specs has a hint', () => {
  for (const {name, spec} of ALL_SPECS) {
    it(name, () => {
      const unhinted = pointers(spec).filter(
        pointer => !UNDOCUMENTED.test(pointer) && !schemaAt(pointer, spec)?.description,
      );
      expect(unhinted).toEqual([]);
    });
  }
});

describe('the fields that most need explaining', () => {
  // A layout, reached through `layouts` -- the array whose items were the ones
  // the walk used to lose.
  const spec = {
    data: {values: [{a: 1}]},
    layouts: [
      {
        subgroup: {type: 'groupby', key: 'a'},
        aspect_ratio: 'fillY',
        direction: 'LRBT',
        align: 'LB',
        size: {type: 'sum', key: 'a'},
        sort: {key: 'a', direction: 'ascending'},
        box: {fill: 'none'},
      },
    ],
    mark: {color: {key: 'a', type: 'categorical', scheme: 'schemeTableau10'}},
  };

  const cases: [string, string[]][] = [
    // The split rules, which are the difference between a bar chart and a
    // histogram, and are named nowhere else in the document.
    ['#/layouts/0/subgroup/type', ['groupby', 'bin', 'flatten', 'passthrough']],
    // What the letters mean.
    ['#/layouts/0/direction', ['left-to-right', 'bottom-to-top']],
    ['#/layouts/0/align', ['left, bottom']],
    // How space is divided, and what the share is proportional to.
    ['#/layouts/0/aspect_ratio', ['fillX', 'maxfill', 'treemap']],
    ['#/layouts/0/size/type', ['uniform', 'count', 'sum']],
    ['#/layouts/0/sort/direction', ['ascending']],
    ['#/layouts/0/box/fill', ['none']],
    ['#/mark/color/scheme', ['schemeTableau10']],
  ];

  for (const [pointer, mentions] of cases) {
    it(pointer, () => {
      const description = schemaAt(pointer, spec)?.description ?? '';
      for (const mention of mentions) {
        expect(description).toContain(mention);
      }
    });
  }

  // A hint is also the list of what may be written there. These are the fields
  // whose values are a closed set, and completion offers that set from here.
  const enums: [string, number][] = [
    ['#/layouts/0/subgroup/type', 5],
    ['#/layouts/0/direction', 12],
    ['#/layouts/0/align', 15],
    ['#/layouts/0/aspect_ratio', 6],
    ['#/layouts/0/size/type', 3],
    ['#/mark/color/scheme', 10],
  ];

  for (const [pointer, size] of enums) {
    it(`${pointer} offers its values`, () => {
      expect(schemaAt(pointer, spec)?.enum).toHaveLength(size);
    });
  }
});
