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
observed output is quoted with each entry. *Closed*, at the end, records the
entries that used to be here.

---

## Absent

### 1. The `FILTER` data operation

Rule 5 gives a layout's data half four operations: `BIN`, `DUPLICATE`, `FILTER`,
`FLATTEN`. `subgroup.type` ([types.ts:584](../packages/core/src/types.ts#L584))
offers `groupby | bin | flatten | passthrough`. There is no filter anywhere in
the grammar, the engine, or either backend — a spec cannot drop rows.

### 2. The `MAP2D` visual operation

Rule 9 lists `MAP2D | FILLX | FILLY | MAXFILL | PACK`. `aspectRatio`
([types.ts:548](../packages/core/src/types.ts#L548)) has no member that maps a
row to a position, so the entire overlapping-layout branch of Fig. 5 is missing.
Table 2 expresses scatterplots, bubble charts, choropleths, and the image half of
Histoimages with `Map2D`; none of them can be written here.

### 3. Mark alignment

Rule 10 is `⟨Marks⟩ ::= ⟨Size⟩⟨Shape⟩⟨Alignment⟩⟨isShared⟩`. `Mark`
([types.ts:112](../packages/core/src/types.ts#L112)) has `color`, `size`, `shape`,
and no alignment. The layout-level `align` is a different knob and is read only
by `fillX`/`fillY`, so Table 2's center-aligned pack (hierarchical axes) has no
expression.

### 4. Non-cartesian coordinate systems

Table 2 builds the unit pie chart from `FillTheta` + `Pack` in polar
coordinates; §4.1 covers 1D/2D/3D and cartographic space; §5.3 names polar and
three-dimensional packing as the extension the grammar was meant to grow. Both
backends assume a cartesian box throughout.

### 5. Jittering and physicalization

Fig. 5's taxonomy of layout operations has three leaves this library does not
reach: `Map2D` and `jittering` under overlapping, `physicalization` under
packing. Table 1 classifies Kinetica, TouchViz, and the constructive-visualization
work under the last of these.

### 6. Interaction and animation

§7.3 is explicit that Atom "does not include support for interactivity" while
naming item-level selection, details-on-demand, filtering, cross-highlighting,
and animated transitions between layouts as the reason unit visualizations are
worth having. The vega backend hands back a live `View`, so the machinery is
within reach, but nothing in the grammar addresses it.

---

## Dead

### 7. Mark size policies other than `max`

`SizePolicies` ([types.ts:27](../packages/core/src/types.ts#L27)) is
`uniform | count | sum | max`, and Rules 11–12 make size a data function.
Only `max` draws: both backends fall through to a radius of 0, i.e. invisible
marks — [drawing.ts:505](../packages/unit-vis-vega/src/drawing.ts#L505) and
[drawing.ts:78](../packages/unit-vis/src/drawing.ts#L78). Table 2's bubble chart
needs variable-size marks; note that a *container* can now carry a value by area
(see *Closed*, below), so this is the mark-level half of that alone.

### 8. `Layout.type` values other than `gridxy`

`type` is declared as `layoutTypes`
([types.ts:735](../packages/core/src/types.ts#L735)), so `flatten`, `groupby`,
`bin`, and `passthrough` all typecheck as layout *algorithms* and reach
`console.log('Unsupported Layout type')`
([layout.ts:467](../packages/core/src/layout.ts#L467)). The field has exactly one
legal value and the type says otherwise.

### 9. Color scale types

`mark.color.type` admits only `categorical`, and the library's own default writes
`"uniform"` — a value outside the declared union
([constants.ts](../packages/core/src/constants.ts)). The vega backend never reads
the field; the d3 backend answers a non-categorical type with
`console.log('TODO')` and colors ordinally anyway
([drawing.ts:60](../packages/unit-vis/src/drawing.ts#L60)). There is no
quantitative or sequential color scale.

### 10. Color sharing

Rules 8 and 10 attach an `isShared` flag to marks as well as to layouts, and the
paper's own example spec (Fig. 6) carries `"isColorScaleShared": true`. Both
`mark.color.isShared` and `mark.isColorScaleShared` are read by neither backend —
the color scale is always built across the whole chart. 35 of the bundled example
specs set the flag.

### 11. `subgroup.aspect_ratio`

Declared as a number on the subgroup
([types.ts:598](../packages/core/src/types.ts#L598)), never read by anything. A
level's aspect ratio comes from `Layout.aspect_ratio`, one level up, and the one
ratio a spec supplies as a number is `Layout.custom_aspect_ratio` — so this field
has no remaining job, and the honest fix is to delete it.

### 12. `spec.title`

Carried through the spec and rendered by neither backend.

---

## Weakened

### 13. `passthrough` is a degenerate `DUPLICATE`

The paper's `DUPLICATE` copies the dataset into *n* subcontainers; §5.2 uses it
to build repeated charts, and Table 2 expresses Histoimages as "FillX
(Duplicates)". `makeContainersForPassthrough`
([container.ts](../packages/core/src/container.ts)) always produces exactly one
child, so it inserts a level of space policy but never replicates data across
views.

### 14. `sort` reaches only `flatten` levels

`groupby` children come out in first-seen order and `bin` children in edge order,
with no way to reorder either — `makeContainersForFlatten` is the only reader of
`layout.sort`. The paper's sorted-by-fare treemap (Fig. 9) is reachable at the row
level only. `applyDefault` also writes a sort onto *every* layout keyed to
`survived`, a leftover from the Titanic examples that applies to data which has no
such field.

### 15. No axes; labels and legends are vega-only

The grammar has no axis production, which is deliberate: annotations come from
labelled containers. This fork added `labels` and `legend`
([types.ts:263](../packages/core/src/types.ts#L263),
[types.ts:308](../packages/core/src/types.ts#L308)) to cover that ground, and the
d3 backend ignores both.

### 16. Icon and image marks are vega-only

Rule 13 makes a mark's shape `circle | rect`, but Table 1 tracks *Icon* and
*Images* as unit representations and Table 2 expresses Isotypes, PivotViewer, and
Past Visions with image marks. `shape`
([types.ts:193](../packages/core/src/types.ts#L193)) now also takes `emoji`,
`text`, `path` and `image`, each told what to draw by a `MarkContent`
([types.ts:77](../packages/core/src/types.ts#L77)) that is either a literal or a
field read off the row — so the paper's worked examples are expressible. The d3
backend draws circles for all four, and the shapes are inscribed in the container
rather than positioned within it, so Table 1's icon *alignment* (gap 3) is still
out of reach.

---

## Closed

What used to sit under *Dead* as entries 8–11, and the *Weakened* entry that went
with them. Both backends implement each of these, and
[test/packing.test.ts](../test/packing.test.ts) holds them to it — every case is
asserted on the engine's boxes and the compiled dataflow's at once.

- **Weighted `maxfill` under `size.type: "count"`** drew nothing: the treemap
  read its weight off `size.key`, a field `count` never sets, so every weight was
  `NaN` and every child was dropped. The weight is now `getValue`, the same
  quantity every other weighted level divides its space by
  ([layout.ts:399](../packages/core/src/layout.ts#L399)).
- **Treemap weights came off the first row** of each child, so a treemap needed a
  `flatten` above it. The same change fixes it: `sum` aggregates over the child's
  rows, so Table 2's quantum treemap — a treemap of *groups*, sized by their
  total — is now expressible.
- **Weighted `square`/`parent` packing** either centered every box on top of its
  siblings or ignored the weights entirely. It is now a shelf packing, largest
  box first, scaled to fit the parent, at the level's own aspect ratio
  ([shelf.ts](../packages/core/src/shelf.ts)) — Fig. 4's bottom row, and the
  layout both of the paper's novel visualizations (Figs. 9–10, "Pack, Size: Sum,
  Shared") are built from. Sharing works as it does for a fill level: one area
  per unit of weight across the whole sharing group.
- **The right-to-left packing directions** `RLTB`, `RLBT`, `TBRL` and `BTRL`
  logged `TODO` and left the containers unpositioned. All eight orders now place
  their boxes, mirrored on whichever axis runs backwards
  ([utils.ts](../packages/core/src/utils.ts)).
- **`aspect_ratio: "custom"`** had no field to supply the ratio, so its boxes
  came out unsized. `Layout.custom_aspect_ratio`
  ([types.ts:631](../packages/core/src/types.ts#L631)) is that field, and a
  `custom` level without it now raises rather than drawing `NaN`.

The two weighted packings are the parts of the grammar that need a transform vega
does not ship, so a spec using either compiles to a dataflow that runs only where
`unit-vis-vega` has been loaded; `isPortable` reports which specs those are.

---

## Where to start

Of what is left, item 7 is the one that still bites: `mark.size.type` accepts
four values, three of them draw nothing, and the spec validates either way.
Making the three raise would be a small change, and the containers underneath the
marks already carry a value by area, so a bubble chart is a mark-radius scale
away rather than a layout away.

Item 2, `MAP2D`, is the largest gap overall. It is a second layout family rather
than a missing case: nothing in the container tree assumes non-overlap, so the
work is a new `aspect_ratio` arm in the engine and a matching dataflow stage in
the vega compiler.
