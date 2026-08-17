# UnitVis

This library is a fork of Park etal's [unit grammar](https://github.com/intuinno/unit) for specifying unit based charts through a declarative grammar. [You can find the paper here](https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf).

You can see a demo [here](https://unit-vis.netlify.com/).

## Repository layout

This is a workspace. The grammar and its layout engine live in one package, and
each rendering backend in another, so installing a chart library does not mean
installing both of them.

| path | package | what it is |
| --- | --- | --- |
| [packages/core/](packages/core/) | `@unit-vis/core` | The grammar, the types, and the JS layout engine that turns a spec into a tree of boxes. No dependencies. |
| [packages/unit-vis/](packages/unit-vis/) | `unit-vis` | The d3 backend. Draws the container tree the JS engine builds. Depends on `d3-selection`, `d3-scale`, `d3-scale-chromatic`. |
| [packages/unit-vis-vega/](packages/unit-vis-vega/) | `unit-vis-vega` | The vega backend. Compiles a spec into a vega dataflow that lays itself out *and* draws itself. Depends on `vega`, and nothing else. |
| [specs/](specs/) | — | The example specs, as plain JSON. The app's gallery, the test corpus, and the worked examples in this readme are all the same files. |
| [apps/playground/](apps/playground/) | — | The demo site: a spec editor with both backends rendering side by side. Serves the datasets the specs point at from its `public/data`. |
| [test/](test/) | — | One suite for the workspace, most of it holding the vega compiler to the JS engine. |

The two backends take different routes to the same picture. The d3 one draws the
tree `@unit-vis/core` builds in JS. The vega one compiles `spec.layouts` into one
dataflow stage per level and lets vega do the subdividing, sizing and
positioning — so nothing but the rows crosses into vega, and the vega spec it
emits is the entire chart. They are held to the same output spec for spec by
[test/backend-parity.test.ts](test/backend-parity.test.ts).

They differ in what they can draw on top of it: `labels` and `legend` are
vega-only. Pick `unit-vis-vega` unless you have a reason to want the d3 one.

## Usage

```
yarn add unit-vis-vega    # or: yarn add unit-vis
```

First have a DOM element present with the id that you desire, then simply run

```js
import UnitVis from 'unit-vis-vega';

UnitVis('target', GRAMMAR_STATEMENT);
```

And that's it! The call resolves once the chart is on the page -- data named by
`data.url` is fetched first -- and the vega backend hands back the live
[vega `View`](https://vega.github.io/vega/docs/api/view/), so you can drive the
chart after the fact or export it with `view.toImageURL('png')`.

### The compiled vega spec

Because the vega backend computes the layout in vega rather than ahead of it,
the spec it builds is self-contained. `buildVegaSpec` hands you that spec, and
nothing about it points back at this library:

```js
import {applyDefault, buildVegaSpec, isPortable} from 'unit-vis-vega';

applyDefault(spec);                             // fills in the grammar's defaults
const vegaSpec = buildVegaSpec(spec, rows);     // a complete vega spec
JSON.stringify(vegaSpec);                       // paste into the Vega Editor
```

So a unit chart can be embedded with `vega-embed`, rendered server-side by the
vega CLI, or handed to anything else that speaks vega. Being a live dataflow
also means it recomputes incrementally: change a signal, push new data through
`view.change`, or insert a `filter` transform ahead of the layout, and vega
re-lays out only what moved.

One case is not portable. A `maxfill` level with a `sum`/`count` size is a
squarified treemap, which is a sequential algorithm rather than a reduction, so
it is registered as a custom vega transform (see
[treemap-transform.ts](packages/unit-vis-vega/src/treemap-transform.ts)) and
only runs where this package has been loaded. `isPortable(spec)` tells you which
kind of spec you have.

Now you might want to embed this library in a react component, perfectly normal thing to want to do. You can do that via

```js
export default function ExampleComponent() {
  useEffect(() => {
    const target = document.querySelector('#target');
    if (target) {
      target.innerHTML = '';
    }
    UnitVis('target', GRAMMAR_STATEMENT);
  });

  return (
    <div>
      <div id="target" />
    </div>
  );
}
```

Both packages re-export everything in `@unit-vis/core`, so the `Spec` type and
the JS layout engine come along with whichever backend you installed. The vega
backend does not use `buildScene` itself, but it is there if you want the boxes
as data:

```ts
import UnitVis, {buildScene, type Spec} from 'unit-vis-vega';
```

## Mark shapes

Every row is drawn as a `circle` or a `rect` on both backends. The vega backend
adds four more, each told what to draw by the `mark` field of the same name:

```js
"mark": {
  "shape": "emoji",
  "emoji": {"key": "species", "domain": ["Adelie", "Gentoo"], "range": ["🐧", "🐦"], "default": "❓"}
}
```

| `shape`  | told by      | draws                                                        |
| -------- | ------------ | ------------------------------------------------------------ |
| `emoji`  | `mark.emoji` | the glyph, one container across, in the font's own colors      |
| `text`   | `mark.text`  | the string, shrunk to fit unless `mark.fontSize` says otherwise |
| `path`   | `mark.path`  | an SVG path, read in the box from (-1, -1) to (1, 1)           |
| `image`  | `mark.image` | the picture at a url or data uri, aspect ratio kept            |

Each of those fields takes a literal -- `"🐧"`, `"M0,-1L1,1L-1,1Z"` -- or reads
the row. `{"key": "name"}` draws the field's own value; adding a `range` draws
that instead, and it is handed out exactly as a vega scale hands out a range --
paired with `domain` where you give one, in first-seen order where you do not,
repeating when the range runs short. `default` covers a value the domain leaves
out. That is a real ordinal scale in the compiled spec, so a live view can be
handed a different `range` through the `<shape>Range` signal.

All four sit in the box a `circle` would have taken, centered on the container
and sized by `mark.size`, so the shape is the only thing that changes when you
switch between them. A shape whose field is unset has nothing to draw and falls
back to circles. `legend` swatches stay circles for all four -- they explain
`mark.color.key`, which only `text` and `path` are painted with.

Example specs for all four, in the playground's spec list:
[seattle_weather_emoji](specs/seattle_weather_emoji.json),
[monarchs_text](specs/monarchs_text.json) and
[cars_origin_text](specs/cars_origin_text.json),
[cars_origin_paths](specs/cars_origin_paths.json), and
[iowa_energy_images](specs/iowa_energy_images.json).
The playground draws both backends side by side, so those four are also the
quickest way to see what the d3 backend does with a shape it has never heard of.

The d3 backend (`unit-vis`) draws circles for all of them.

## Labels and legends

The vega backend can annotate a chart, which is opt-in per spec:

```js
{
  // ... the rest of the spec
  "labels": true,                                    // or {"orient": "left", "layouts": ["species"]}
  "legend": {"orient": "right", "title": "Species"}  // or just true
}
```

`labels` prints each container's group next to its box -- the groupby value, the
bin range -- and by default labels every layout that names its groups, skipping
`flatten` levels (whose labels are row numbers). `legend` draws a swatch per
value of `mark.color.key`, shaped like the marks it stands for. Both sit outside
the plot area, so the chart keeps the width and height the spec asked for and the
svg around it grows to fit.

The d3 backend (`unit-vis`) ignores both options and renders the spec exactly as
it would without them.

## Grammar

If you are following along from the paper, we make one small change to the language. Specifically we change the data attribute from being a string pointing to the data, and replace it with an object, either {url: 'MY_CSV_LOCATION.csv'} or {url: JSON_OF_YOUR_DATA}. Not too bad!

The grammar's types are the schema's source of truth: every description in
[unit-vis-schema.json](packages/core/unit-vis-schema.json) comes from a jsdoc
comment in [packages/core/src/types.ts](packages/core/src/types.ts). Edit the
types, then run `yarn schema` to regenerate.

## Development

```
yarn install
yarn dev          # the playground, against the packages' sources
yarn test         # the whole suite, backend parity included
yarn lint
yarn build        # build the packages, typecheck everything, build the playground
yarn schema       # regenerate the json schema from the core types
yarn data:sync    # copy the vega-datasets files the specs reference into public/data
```

Example specs read their data from `apps/playground/public/data`, which is what
vite serves and what the test harness reads off disk. Point a new spec at
`data/<file>` from [vega-datasets](https://github.com/vega/vega-datasets) and
`yarn data:sync` will fetch it out of the installed package.

The playground and the tests both resolve `unit-vis`, `unit-vis-vega`, and
`@unit-vis/core` to their TypeScript sources rather than to `dist`, so a change
to the library is a hot reload rather than a rebuild, and the tests cannot pass
against a stale build.
