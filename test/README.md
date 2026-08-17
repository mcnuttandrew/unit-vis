# Backend comparison harness

Renders every spec in `specs/` at the top of the repository through both backends
inside jsdom and compares the SVG they produce.

`harness/specs.ts` splits that corpus in two. `PARITY_SPECS` is the specs
written in the grammar both backends implement, and is what everything
comparative runs on. `VEGA_ONLY_SPECS` is the rest — specs asking for a mark
shape only the vega backend draws (`emoji`, `text`, `path`, `image`), which the
d3 backend answers with circles, leaving a comparison nothing to hold to.
`mark-shapes.test.ts` covers those on the one backend that draws them.

```
yarn test                 # run the suite
yarn test:watch           # re-run on change
yarn report:svg           # write test/__output__/report.md + one svg per spec per backend
yarn report:svg --full    # same, over the complete datasets instead of a row sample
yarn report:svg --rows 40 # explicit sample size
```

## How it works

The two backends no longer share a layout, and holding them to each other is the
point of this suite. `@unit-vis/core` exports `buildScene`, which runs defaults →
data → layout in JS and returns a container tree; the d3 backend draws that.
The vega backend compiles the same spec into a dataflow that lays itself out
(`unit-vis-vega/src/layout.ts`) and never sees the tree. So a difference here can
be a layout difference *or* a drawing one — which is what makes these tests the
specification the compiler is written against. The suite imports the packages by
name (`unit-vis`, `unit-vis-vega`) and vitest resolves those to their sources, so
it can never pass against a stale build.

- `harness/render.ts` — loads a spec's CSV off disk (through the library's own
  `parseCsv`, the same one it uses at runtime) and draws it both ways:
  - `renderOld` → `drawUnit` → d3-selection → jsdom document
  - `renderVegaEmbedded` → `drawUnitVega` → a live `vega.View` mounted in the
    jsdom document (the real browser path)
  - `renderVegaHeadless` → `buildVegaSpec` → `vega.View(...).toSVG()` (same
    markup, minus the wrapper element vega mounts; what the bulk checks measure,
    verified against the embedded path in `svg-quality.test.ts`)
- `harness/svg-model.ts` — flattens either document into the same list of
  primitives in absolute canvas coordinates. The old backend nests
  `<g transform="translate(..)">` around `<rect>`/`<circle>`; vega emits flat
  `<g class="mark-arc role-mark unitArcMarks">` groups of `<path>`. Transforms
  are composed by hand and paths are reduced to bounding boxes, so the
  comparison never depends on either renderer's markup style.
- `harness/path-geometry.ts` — the path sampler that makes that possible
  (`M/L/H/V/C/S/Q/T/A/Z`, absolute and relative, arcs via center
  parameterization).
- `harness/compare.ts` — the metrics: per-mark center distance, size error,
  shape/fill agreement, color-partition equivalence, nearest-neighbor matching,
  overlap ratio, out-of-bounds and degenerate counts.

Roles are read off the markup: in the old backend the first `<rect>` in a group
is that layout level's box and anything after it is a unit mark; in vega they are
told apart by the mark names `containerMarks` / `unitMarks` / `unitArcMarks` set
in `buildVegaSpec`. **Renaming those marks will break the harness** — update
`UNIT_MARK_NAMES` / `BOX_MARK_NAMES` in `harness/svg-model.ts` if you do.

## The tests

- `harness.test.ts` — tests the harness itself against hand-written markup. The
  path sampler and transform flattening are load-bearing for every other claim
  here, so they get their own coverage.
- `backend-parity.test.ts` — old vs vega, per spec: mark count, canvas size,
  position, size, shape, color scheme, color partition, mark order, layout
  boxes. Two specs also run over their full dataset, in case something only
  shows up at scale.
- `svg-quality.test.ts` — per-backend well-formedness: finite geometry, resolved
  fills, marks on the canvas, marks not piled on top of each other, no vega
  dataflow warnings, and the embedded path matching the headless one. Checks
  where the old backend is itself sloppy are comparative — vega must be no
  worse.
- `color-scheme.test.ts` — `mark.color.scheme`, which no bundled spec sets. Specs name schemes the d3 way (`schemeDark2`) and vega's registry uses
  the bare name, so `buildVegaSpec` translates; this pins the palettes both
  backends land on, including the one case where the two registries disagree.
- `mark-shapes.test.ts` — the `emoji`, `text`, `path` and `image` mark shapes,
  which only the vega backend draws: what each one draws (literal, field, or
  mapped field), that all four sit in the box a circle would have taken, that
  `mark.size` reaches them, and that flipping the `markShape` signal reshapes a
  live view. It also holds the bundled specs that use them to drawing what they
  claim to, since the two suites above cannot see them.

## Known differences

`harness/known-differences.ts` is the list of checks that do not pass yet, each
with a reason. It is verified in both directions: if a listed difference stops
reproducing, the suite fails and tells you to delete the entry, so the list
cannot go stale. `KNOWN_LAYOUT_FAILURES` does the same for specs the *JS* layout
engine cannot process at all, which would otherwise look like backend bugs —
those specs have no container tree, so there is nothing to compare the vega
backend's own layout against, even where it renders them happily.

Tolerances: vega serializes path coordinates to three decimals, so identical
geometry differs in the fourth. Positions and sizes are compared at 0.5px, and
overlap ignores anything under 0.05px.

A pair of marks that both render nothing (the old backend's invalid negative
radii versus vega's clamp to 0) counts as agreeing on shape and size — but the
count is reported as `invisiblePairs`, and "draws a visible chart in both
backends" fails if a spec goes entirely blank.
