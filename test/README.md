# Backend comparison harness

Renders every spec in `src/specs` through both drawing backends inside jsdom and
compares the SVG they produce.

```
yarn test                 # run the suite
yarn test:watch           # re-run on change
yarn report:svg           # write test/__output__/report.md + one svg per spec per backend
yarn report:svg --full    # same, over the complete datasets instead of a row sample
yarn report:svg --rows 40 # explicit sample size
```

## How it works

`library/index.ts` exports `buildScene`, which runs defaults → data → layout and
returns the container tree. Both backends draw from that *same* tree, so
anything the comparison sees is a drawing difference, never a layout difference.

- `harness/render.ts` — loads a spec's CSV off disk (parsed exactly as `d3-fetch`
  would at runtime), builds the scene, and draws it:
  - `renderOld` → `drawUnit` → d3-selection → jsdom document
  - `renderVegaEmbedded` → `drawUnitVega` → vega-embed → jsdom document (the real
    browser path)
  - `renderVegaHeadless` → `buildVegaSpec` → `vega.View(...).toSVG()` (same
    markup without vega-embed's chrome; what the bulk checks measure, verified
    against the embedded path in `svg-quality.test.ts`)
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
- `color-scheme.test.ts` — `mark.color.scheme`, which no spec in `src/specs`
  sets. Specs name schemes the d3 way (`schemeDark2`) and vega's registry uses
  the bare name, so `buildVegaSpec` translates; this pins the palettes both
  backends land on, including the one case where the two registries disagree.

## Known differences

`harness/known-differences.ts` is the list of checks that do not pass yet, each
with a reason. It is verified in both directions: if a listed difference stops
reproducing, the suite fails and tells you to delete the entry, so the list
cannot go stale. `KNOWN_LAYOUT_FAILURES` does the same for specs the layout
engine cannot process at all, which would otherwise look like backend bugs.

Tolerances: vega serializes path coordinates to three decimals, so identical
geometry differs in the fourth. Positions and sizes are compared at 0.5px, and
overlap ignores anything under 0.05px.

A pair of marks that both render nothing (the old backend's invalid negative
radii versus vega's clamp to 0) counts as agreeing on shape and size — but the
count is reported as `invisiblePairs`, and "draws a visible chart in both
backends" fails if a spec goes entirely blank.
