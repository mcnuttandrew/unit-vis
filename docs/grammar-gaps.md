# What the grammar promises and the engine doesn't do

This library is a fork of the Atom grammar ([Park, Drucker, Fernandez, and
Elmqvist, _Atom: A Grammar for Unit Visualizations_](https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf)).
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

Everything under _Dead_ was confirmed by running it through `buildScene`, and the
observed output is quoted with each entry. _Closed_, at the end, records the
entries that used to be here.

---

## Absent

### 1. The `FILTER` data operation

Rule 5 gives a layout's data half four operations: `BIN`, `DUPLICATE`, `FILTER`,
`FLATTEN`. `subgroup.type` ([types.ts:735](../packages/core/src/types.ts#L735))
offers `groupby | bin | flatten | passthrough`. There is no filter anywhere in
the grammar, the engine, or either backend — a spec cannot drop rows.

### 2. The `MAP2D` visual operation

Rule 9 lists `MAP2D | FILLX | FILLY | MAXFILL | PACK`. `aspectRatio`
([types.ts:699](../packages/core/src/types.ts#L699)) has no member that maps a
row to a position, so the entire overlapping-layout branch of Fig. 5 is missing.
Table 2 expresses scatterplots, bubble charts, choropleths, and the image half of
Histoimages with `Map2D`; none of them can be written here.

### 3. Mark alignment

Rule 10 is `⟨Marks⟩ ::= ⟨Size⟩⟨Shape⟩⟨Alignment⟩⟨isShared⟩`. `Mark`
([types.ts:133](../packages/core/src/types.ts#L133)) has `color`, `size`, `shape`,
and no alignment. The layout-level `align` is a different knob and is read only
by `fillX`/`fillY`, so Table 2's center-aligned pack (hierarchical axes) has no
expression.

---

## Dead

### 8. `Layout.type` values other than `gridxy`

`type` is declared as `layoutTypes`
([types.ts:886](../packages/core/src/types.ts#L886)), so `flatten`, `groupby`,
`bin`, and `passthrough` all typecheck as layout _algorithms_ and reach
`console.log('Unsupported Layout type')`
([layout.ts:467](../packages/core/src/layout.ts#L467)). The field has exactly one
legal value and the type says otherwise.

### 9. Color scale types

`mark.color.type` admits only `categorical`, and the library's own default writes
`"uniform"` — a value outside the declared union
([constants.ts](../packages/core/src/constants.ts)). The vega backend never reads
the field; the d3 backend answers a non-categorical type with
`console.log('TODO')` and colors ordinally anyway
([drawing.ts:37](../packages/unit-vis/src/drawing.ts#L37)). There is no
quantitative or sequential color scale.

### 10. Color sharing

Rules 8 and 10 attach an `isShared` flag to marks as well as to layouts, and the
paper's own example spec (Fig. 6) carries `"isColorScaleShared": true`. Both
`mark.color.isShared` and `mark.isColorScaleShared` are read by neither backend —
the color scale is always built across the whole chart. 35 of the bundled example
specs set the flag.

### 11. `subgroup.aspect_ratio`

Declared as a number on the subgroup
([types.ts:749](../packages/core/src/types.ts#L749)), never read by anything. A
level's aspect ratio comes from `Layout.aspect_ratio`, one level up, and the one
ratio a spec supplies as a number is `Layout.custom_aspect_ratio` — so this field
has no remaining job, and the honest fix is to delete it.

---

## Weakened

### 13. `passthrough` is a degenerate `DUPLICATE`

The paper's `DUPLICATE` copies the dataset into _n_ subcontainers; §5.2 uses it
to build repeated charts, and Table 2 expresses Histoimages as "FillX
(Duplicates)". `makeContainersForPassthrough`
([container.ts](../packages/core/src/container.ts)) always produces exactly one
child, so it inserts a level of space policy but never replicates data across
views.

---

## Closed

What used to sit under _Dead_ as entries 7 and 12. Both are implemented on the
backends named below, and [test/mark-size.test.ts](../test/mark-size.test.ts)
and [test/title.test.ts](../test/title.test.ts) hold them to it.

- **Mark size policies other than `max`** (entry 7) drew a radius of 0, so three
  of the four values of `SizePolicies`
  ([types.ts:48](../packages/core/src/types.ts#L48)) validated and rendered
  nothing. All four now draw, on both backends. `max` is unchanged: the mark is
  inscribed in its own container. `uniform` draws every mark in its sharing
  group at one size, the largest that fits every container in the group.
  `count` and `sum` make the mark's *area* proportional to the rows in its
  container, or to `mark.size.key` summed over them, scaled so the largest value
  in the group is the one drawn at that group's uniform size — so the marks
  carry a value and still fit their boxes. The sharing group is the whole chart
  under `isShared`, and the marks under one parent container without it, which
  is the same distinction `Layout.size.isShared` draws a level up. A `sum` with
  no `key` now raises rather than drawing empty marks. Table 2's bubble chart is
  a spec whose deepest level groups rather than flattens, with a `count` or
  `sum` mark size over it — see
  [penguins_species_bubbles](../specs/penguins_species_bubbles.json) and
  [iowa_energy_bubbles](../specs/iowa_energy_bubbles.json). Mark _alignment_
  (entry 3) is still absent, so a mark under any policy is centered in its
  container.
- **`spec.title`** (entry 12) was carried through the spec and drawn by nobody.
  It is now a heading drawn by the vega backend, as a string or as a `Title`
  ([types.ts:438](../packages/core/src/types.ts#L438)) with a subtitle, a side,
  an alignment along that side, and type. Like `labels` and `legend` it is drawn
  outside the plotting area, in room added around the canvas rather than taken
  out of it, so the chart underneath is exactly the chart the spec asked for.
  The d3 backend ignores it, as it does the other two decorations.
