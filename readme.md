# UnitVis

This library is a fork of Park etal's [unit grammar](https://github.com/intuinno/unit) for specifying unit based charts through a declarative grammar. [You can find the paper here](https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf).

You can see a demo [here](https://unit-vis.netlify.com/).

## Repository layout

This is a workspace. The grammar and its layout engine live in one package, and
each rendering backend in another, so installing a chart library does not mean
installing both of them.

| path | package | what it is |
| --- | --- | --- |
| [packages/core/](packages/core/) | `@unit-vis/core` | The grammar, the types, and the layout engine that turns a spec into a tree of boxes. No dependencies. |
| [packages/unit-vis/](packages/unit-vis/) | `unit-vis` | The d3 backend. Depends on `d3-selection`, `d3-scale`, `d3-scale-chromatic`. |
| [packages/unit-vis-vega/](packages/unit-vis-vega/) | `unit-vis-vega` | The vega backend. Depends on `vega`, and nothing else. |
| [apps/playground/](apps/playground/) | — | The demo site: a spec editor with both backends rendering side by side. |
| [test/](test/) | — | One suite for the workspace, most of it comparing the two backends against each other. |

Both backends draw the same grammar from the same layout, so a spec renders the
same either way. They differ in what they can draw on top of it: `labels` and
`legend` are vega-only. Pick `unit-vis-vega` unless you have a reason to want
the d3 one.

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
the layout engine come along with whichever backend you installed:

```ts
import UnitVis, {buildScene, type Spec} from 'unit-vis-vega';
```

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
```

The playground and the tests both resolve `unit-vis`, `unit-vis-vega`, and
`@unit-vis/core` to their TypeScript sources rather than to `dist`, so a change
to the library is a hot reload rather than a rebuild, and the tests cannot pass
against a stale build.
