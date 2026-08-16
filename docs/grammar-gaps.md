# What the grammar promises and the engine doesn't do

This library is a fork of the Atom grammar ([Park, Drucker, Fernandez, and
Elmqvist, *Atom: A Grammar for Unit Visualizations*](https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf)).
The paper defines the language in BNF (Rules 1–14, §5) and charts its design
space in Figs. 4–5 and Tables 1–2. This document is the difference between that
language and what `@unit-vis/core` and the two backends actually do.

Three kinds of gap, in descending order of how surprising they are:

- **Absent** — a production of the grammar with no field to write it in. You
  cannot express these, and the type checker tells you so.
- **Dead** — a value the grammar accepts and the schema documents, which the
  engine then answers with `NaN`, a radius of 0, or silence. These are the
  dangerous ones: the spec validates and the chart comes out blank or wrong.
- **Weakened** — implemented, but narrower than the paper's version, so a chart
  the paper builds with it is out of reach.

Everything under *Dead* was confirmed by running it through `buildScene`, and the
observed output is quoted with each entry.

---

## Absent

### 1. The `FILTER` data operation

Rule 5 gives a layout's data half four operations: `BIN`, `DUPLICATE`, `FILTER`,
`FLATTEN`. `subgroup.type` ([types.ts:462](../packages/core/src/types.ts#L462))
offers `groupby | bin | flatten | passthrough`. There is no filter anywhere in
the grammar, the engine, or either backend — a spec cannot drop rows.

### 2. The `MAP2D` visual operation

Rule 9 lists `MAP2D | FILLX | FILLY | MAXFILL | PACK`. `aspectRatio`
([types.ts:426](../packages/core/src/types.ts#L426)) has no member that maps a
row to a position, so the entire overlapping-layout branch of Fig. 5 is missing.
Table 2 expresses scatterplots, bubble charts, choropleths, and the image half of
Histoimages with `Map2D`; none of them can be written here.

### 3. Mark alignment

Rule 10 is `⟨Marks⟩ ::= ⟨Size⟩⟨Shape⟩⟨Alignment⟩⟨isShared⟩`. `Mark`
([types.ts:63](../packages/core/src/types.ts#L63)) has `color`, `size`, `shape`,
and no alignment. The layout-level `align` is a different knob and is read only
by `fillX`/`fillY`, so Table 2's center-aligned pack (hierarchical axes) has no
expression.

### 4. Non-cartesian coordinate systems

Table 2 builds the unit pie chart from `FillTheta` + `Pack` in polar
coordinates; §4.1 covers 1D/2D/3D and cartographic space; §5.3 names polar and
three-dimensional packing as the extension the grammar was meant to grow. Both
backends assume a cartesian box throughout.

### 5. Jittering and physicalization

Fig. 5's taxonomy of layout operations has four leaves this library does not
reach: `Map2D` and `jittering` under overlapping, `physicalization` under
packing. Table 1 classifies Kinetica, TouchViz, and the constructive-visualization
work under the last of these.

### 6. Icon and image marks

`shape` is `circle | rect` ([types.ts:128](../packages/core/src/types.ts#L128)),
matching Rule 13. But Table 1 tracks *Icon* and *Images* as unit representations
and Table 2 expresses Isotypes, PivotViewer, and Past Visions with image marks,
so the paper's own worked examples need a mark this grammar cannot name.

### 7. Interaction and animation

§7.3 is explicit that Atom "does not include support for interactivity" while
naming item-level selection, details-on-demand, filtering, cross-highlighting,
and animated transitions between layouts as the reason unit visualizations are
worth having. The vega backend hands back a live `View`, so the machinery is
within reach, but nothing in the grammar addresses it.

---

## Dead

### 8. Mark size policies other than `max`

`SizePolicies` ([types.ts:27](../packages/core/src/types.ts#L27)) is
`uniform | count | sum | max`, and Rules 11–12 make size a data function.
Only `max` draws: both backends fall through to a radius of 0, i.e. invisible
marks — [drawing.ts:214](../packages/unit-vis-vega/src/drawing.ts#L214) and
[drawing.ts:70](../packages/unit-vis/src/drawing.ts#L70). Table 2's bubble chart
and quantum treemap both need variable-size marks.

### 9. `maxfill` with `size.type: "count"` draws nothing

A non-uniform `maxfill` routes to the squarified treemap, which reads its weight
off `size.key` ([layout.ts:355](../packages/core/src/layout.ts#L355)) — a field
`count` never sets. Every weight is `NaN`, the positive-weight filter drops every
child, and the level comes back empty. Fig. 4 shows MaxFill × Count as an
ordinary cell of the design space.

```
groupby g, maxfill, size {type: count} →  1:NaN,NaN 0x0 | 0:NaN,NaN 0x0 | 1:NaN,NaN 0x0 …
```

### 10. Weighted packing (`square` / `parent` with `count` or `sum`)

The bottom row of Fig. 4, and the layout of both novel visualizations the paper
generates (Fig. 9 and Fig. 10, "Pack, Size: Sum, Shared"). Three sub-cases, all
wrong:

- **`square` + `isShared: true`** sizes the boxes by area correctly and then
  centers every one of them in the parent, so siblings sit concentrically on top
  of each other. [utils.ts:474-504](../packages/core/src/utils.ts#L474-L504);
  the vega backend reproduces it faithfully in `sharedSquareUnit`.
- **`square` + `isShared: false`** ignores the weights and emits a uniform grid.
- **`parent`, either sharing mode** ignores the weights; the shared path's
  `switch` has no `parent` arm at all.

```
square, sum, shared    →  a:258,138 215x215 | b:201,81 328x328 | c:226,106 277x277   (all overlapping)
square, sum, unshared  →  a:0,240 240x240   | b:240,240 240x240 | c:480,240 240x240  (weights ignored)
parent, sum, shared    →  a:0,240 360x240   | b:360,240 360x240 | c:0,0 360x240      (weights ignored)
```

### 11. Right-to-left packing directions

`RLTB`, `RLBT`, `TBRL`, and `BTRL` are members of `Direction`
([types.ts:348](../packages/core/src/types.ts#L348)). The engine logs `TODO` and
leaves the containers unpositioned
([utils.ts:149](../packages/core/src/utils.ts#L149),
[utils.ts:193](../packages/core/src/utils.ts#L193)); the vega backend mirrors
this with an explicit `unpositioned()` rather than inventing a placement.

```
flatten, maxfill, direction RLTB →  4:NaN,NaN 240x240 | 3:NaN,NaN 240x240 …
```

### 12. `aspect_ratio: "custom"`

Accepted by the grammar, but there is no field to supply the custom ratio, so the
ratio is `NaN` and the boxes are unsized —
[layout.ts:324](../packages/core/src/layout.ts#L324),
[utils.ts:253](../packages/core/src/utils.ts#L253).

```
flatten, custom →  4:0,NaN 720xNaN | 3:0,NaN 720xNaN …
```

### 13. `Layout.type` values other than `gridxy`

`type` is declared as `layoutTypes`
([types.ts:604](../packages/core/src/types.ts#L604)), so `flatten`, `groupby`,
`bin`, and `passthrough` all typecheck as layout *algorithms* and reach
`console.log('Unsupported Layout type')`
([layout.ts:423](../packages/core/src/layout.ts#L423)). The field has exactly one
legal value and the type says otherwise.

### 14. Color scale types

`mark.color.type` admits only `categorical`, and the library's own default writes
`"uniform"` — a value outside the declared union
([constants.ts](../packages/core/src/constants.ts)). The vega backend never reads
the field; the d3 backend answers a non-categorical type with
`console.log('TODO')` and colors ordinally anyway
([drawing.ts:55](../packages/unit-vis/src/drawing.ts#L55)). There is no
quantitative or sequential color scale.

### 15. Color sharing

Rules 8 and 10 attach an `isShared` flag to marks as well as to layouts, and the
paper's own example spec (Fig. 6) carries `"isColorScaleShared": true`. Both
`mark.color.isShared` and `mark.isColorScaleShared` are read by neither backend —
the color scale is always built across the whole chart. 35 of the bundled example
specs set the flag.

### 16. `subgroup.aspect_ratio`

Declared as a number on the subgroup
([types.ts:476](../packages/core/src/types.ts#L476)), never read by anything. A
level's aspect ratio comes from `Layout.aspect_ratio`, one level up.

### 17. `spec.title`

Carried through the spec and rendered by neither backend.

---

## Weakened

### 18. `passthrough` is a degenerate `DUPLICATE`

The paper's `DUPLICATE` copies the dataset into *n* subcontainers; §5.2 uses it
to build repeated charts, and Table 2 expresses Histoimages as "FillX
(Duplicates)". `makeContainersForPassthrough`
([container.ts](../packages/core/src/container.ts)) always produces exactly one
child, so it inserts a level of space policy but never replicates data across
views.

### 19. `sort` reaches only `flatten` levels

`groupby` children come out in first-seen order and `bin` children in edge order,
with no way to reorder either — `makeContainersForFlatten` is the only reader of
`layout.sort`. The paper's sorted-by-fare treemap (Fig. 9) is reachable at the row
level only. `applyDefault` also writes a sort onto *every* layout keyed to
`survived`, a leftover from the Titanic examples that applies to data which has no
such field.

### 20. Treemap weights come off the first row

The squarified treemap reads `size.key` from `contents[0]` of each child
([layout.ts:355](../packages/core/src/layout.ts#L355)), so it needs a `flatten`
above it and a treemap of *groups* sized by their aggregate — Table 2's quantum
treemap — is out of reach.

### 21. No axes; labels and legends are vega-only

The grammar has no axis production, which is deliberate: annotations come from
labelled containers. This fork added `labels` and `legend`
([types.ts:145](../packages/core/src/types.ts#L145),
[types.ts:190](../packages/core/src/types.ts#L190)) to cover that ground, and the
d3 backend ignores both.

---

## Where to start

Items 9 through 12 are the ones that bite: each is reachable from a spec that
validates against the schema, and each fails to a blank or overlapping chart
rather than an error. Making them throw would be a smaller change than making
them work, and would cost nothing that anyone can currently draw.

Item 10 is also the largest genuine expressivity gap that the existing
architecture could absorb — weighted packing is one algorithm away, and it is
what both of the paper's novel visualizations are built from. Item 2, `MAP2D`, is
the largest gap overall, but it is a second layout family rather than a missing
case: nothing in the container tree assumes non-overlap, so the work is a new
`aspect_ratio` arm in the engine and a matching dataflow stage in the vega
compiler.
