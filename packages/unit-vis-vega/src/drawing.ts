import { View, parse } from "vega";
import type {
  Data as VegaData,
  Legend as VegaLegend,
  Mark as VegaMark,
  Signal as VegaSignal,
  Spec as VegaSpec,
} from "vega";
import { defaultSetting } from "@unit-vis/core";

import type { DataRow, Labels, Legend, Mark, Spec } from "@unit-vis/core";
import { ROWS_BY_ID, buildLayoutData, levelName } from "./layout.js";

/**
 * Everything but the rows is computed inside vega.
 *
 * `layout.ts` compiles `spec.layouts` into one `data` stage per level, so this
 * module never sees a container tree -- it reads the datasets that compiler
 * emits and decides what to draw from them:
 *
 *   - `level${d}` holds one tuple per container at depth `d`, already carrying
 *     absolute `absX`/`absY`/`width`/`height`,
 *   - boxes are the union of every level, styled by `lookup` against the layout
 *     list,
 *   - unit marks are the deepest level, one per container that holds rows,
 *   - `joinaggregate` implements the shared mark-size policy,
 *   - signals carry the mark policy, so shape/size/color are encoding-time
 *     decisions rather than spec-construction-time branches.
 *
 * The upshot is that the emitted spec is the whole chart: it serializes, it
 * re-runs incrementally when a signal changes, and a transform inserted ahead of
 * the layout reshapes it without a round trip through JS.
 */

/**
 * Defaults for the two decorations this backend draws and the old one does not.
 * They live here rather than in `constants` because `applyDefault` fills its
 * defaults in on the spec itself, and both decorations are off until a spec
 * asks for them.
 */
const labelDefaults: Required<Omit<Labels, "layouts">> = {
  orient: "bottom",
  offset: 4,
  fontSize: 10,
  color: "#333333",
};
const legendDefaults: Required<Omit<Legend, "title">> = { orient: "right" };

/** Subgroup types whose containers carry a label worth printing. */
const NAMING_SUBGROUPS = new Set(["groupby", "bin"]);

interface ResolvedLabels extends Required<Omit<Labels, "layouts">> {
  /** Depths of the levels to label, i.e. `spec.layouts` index + 1. */
  depths: number[];
}

interface ResolvedLegend extends Required<Omit<Legend, "title">> {
  title: string;
}

/**
 * `spec.labels` picks which layout levels get their container labels drawn.
 * Left to itself it picks the levels that actually name their groups: a
 * `flatten` level labels its containers by position in the group, which is a
 * row number rather than anything a reader wants on the chart.
 */
function resolveLabels(spec: Spec): ResolvedLabels | null {
  if (!spec.labels) {
    return null;
  }
  const options: Labels = spec.labels === true ? {} : spec.labels;
  const wanted = options.layouts;
  const depths = spec.layouts
    .map((layout, index) => ({ layout, depth: index + 1 }))
    .filter(({ layout }) =>
      wanted
        ? Boolean(layout.name) && wanted.indexOf(layout.name!) >= 0
        : Boolean(layout.subgroup) && NAMING_SUBGROUPS.has(layout.subgroup.type),
    )
    .map(({ depth }) => depth);

  if (!depths.length) {
    return null;
  }
  return {
    orient: options.orient ?? labelDefaults.orient,
    offset: options.offset ?? labelDefaults.offset,
    fontSize: options.fontSize ?? labelDefaults.fontSize,
    color: options.color ?? labelDefaults.color,
    depths,
  };
}

/** A legend needs something to explain, so it needs a color key. */
function resolveLegend(spec: Spec): ResolvedLegend | null {
  const colorKey = spec.mark && spec.mark.color && spec.mark.color.key;
  if (!spec.legend || !colorKey) {
    return null;
  }
  const options: Legend = spec.legend === true ? {} : spec.legend;
  return {
    orient: options.orient ?? legendDefaults.orient,
    title: options.title ?? colorKey,
  };
}

function buildData(
  spec: Spec,
  rows: DataRow[],
  labels: ResolvedLabels | null,
): VegaData[] {
  const numLayouts = spec.layouts.length;

  // The layout itself: one stage per level of `spec.layouts`, ending in a
  // `level${d}` dataset of containers per level.
  const data: VegaData[] = buildLayoutData(spec, rows);

  // The drawing surface, read off the canvas container rather than off the spec.
  data.push({
    name: "rootBounds",
    source: levelName(0),
    transform: [
      { type: "formula", as: "x0", expr: "datum.absX" },
      { type: "formula", as: "x1", expr: "datum.absX + datum.width" },
      { type: "formula", as: "y0", expr: "datum.absY" },
      { type: "formula", as: "y1", expr: "datum.absY + datum.height" },
    ],
  });

  // Per-level box styling, resolved against the global defaults inside vega.
  // `project` runs first because `buildLayoutList` turns `spec.layouts` into a
  // doubly linked list, which is cyclic.
  data.push({
    name: "layoutBoxStyles",
    values: spec.layouts,
    transform: [
      { type: "project", fields: ["box"], as: ["box"] },
      { type: "window", ops: ["row_number"], fields: [null], as: ["depth"] },
      { type: "formula", as: "depth", expr: "datum.depth - 1" },
      {
        type: "formula",
        as: "boxFill",
        expr: "isValid(datum.box) && isValid(datum.box.fill) ? datum.box.fill : boxDefaults.fill",
      },
      {
        type: "formula",
        as: "boxStroke",
        expr: "isValid(datum.box) && isValid(datum.box.stroke) ? datum.box.stroke : boxDefaults.stroke",
      },
      {
        type: "formula",
        as: "boxStrokeWidth",
        expr: "isValid(datum.box) && isValid(datum.box['stroke-width']) ? datum.box['stroke-width'] : boxDefaults['stroke-width']",
      },
      {
        type: "formula",
        as: "boxOpacity",
        expr: "isValid(datum.box) && isValid(datum.box.opacity) ? datum.box.opacity : boxDefaults.opacity",
      },
    ],
  });

  // One box per container per layout level, matching the `<g>`/`<rect>` pair
  // the d3 backend appends as it walks `spec.layouts`. The root is the frame
  // itself, so boxes start at depth 1 and the level-`n` box is styled by
  // `spec.layouts[n - 1]`.
  const boxSources: string[] = [];
  for (let depth = 1; depth <= numLayouts; depth++) {
    boxSources.push(levelName(depth));
  }
  data.push({
    name: "boxes",
    ...(boxSources.length ? { source: boxSources } : { values: [] }),
    transform: [
      { type: "formula", as: "layoutIndex", expr: "datum.depth - 1" },
      {
        type: "lookup",
        from: "layoutBoxStyles",
        key: "depth",
        fields: ["layoutIndex"],
        values: ["boxFill", "boxStroke", "boxStrokeWidth", "boxOpacity"],
      },
    ],
  });

  // Unit marks: one per container of the deepest level that holds any rows.
  // A container the layout made but no row landed in -- an empty bin, a
  // category absent from this small multiple -- takes its space and draws its
  // box, but has nothing to draw a mark for.
  data.push({
    name: "units",
    source: levelName(numLayouts),
    transform: [
      { type: "filter", expr: "datum.cnt > 0" },
      // The mark stands for the container, and reads its encoding off the first
      // row in it -- which is every row, when the last level is a `flatten`.
      {
        type: "lookup",
        from: ROWS_BY_ID,
        key: "id",
        fields: ["firstId"],
        as: ["row"],
      },
      { type: "formula", as: "cx", expr: "datum.absX + datum.width / 2" },
      { type: "formula", as: "cy", expr: "datum.absY + datum.height / 2" },
      {
        type: "formula",
        as: "color",
        expr: 'isValid(colorKey) ? datum.row[colorKey] : ""',
      },
      {
        type: "formula",
        as: "isolatedRadius",
        expr: "markSizeType === 'max' ? min(datum.width, datum.height) / 2 : 0",
      },
      // The shared-size policy is a min across every unit in the chart, which
      // is exactly a whole-dataset aggregate joined back onto each row.
      {
        type: "joinaggregate",
        fields: ["isolatedRadius"],
        ops: ["min"],
        as: ["sharedRadius"],
      },
      {
        type: "formula",
        as: "radius",
        expr: "markSizeShared ? datum.sharedRadius : datum.isolatedRadius",
      },
    ],
  });

  // Container labels, drawn from whichever levels `spec.labels` selected. The
  // level datasets already carry every field the text marks need, so this is
  // just the union of the levels in play.
  if (labels) {
    data.push({
      name: "containerLabels",
      source: labels.depths.map(levelName),
    });
  }

  // Shape selection is a filter over a signal rather than a JS branch, so
  // flipping `markShape` reshapes the chart without rebuilding the spec.
  data.push(
    {
      name: "rectUnits",
      source: "units",
      transform: [{ type: "filter", expr: "markShape === 'rect'" }],
    },
    {
      name: "circleUnits",
      source: "units",
      transform: [{ type: "filter", expr: "markShape !== 'rect'" }],
    },
  );

  return data;
}

function buildSignals(spec: Spec, labels: ResolvedLabels | null): VegaSignal[] {
  // `applyDefault` normally fills this in, but the type allows it to be absent.
  const mark: Partial<Mark> = spec.mark ?? {};
  const labelSignals: VegaSignal[] = labels
    ? [
        { name: "labelOrient", value: labels.orient },
        { name: "labelOffset", value: labels.offset },
        { name: "labelFontSize", value: labels.fontSize },
        { name: "labelColor", value: labels.color },
      ]
    : [];
  return [
    ...labelSignals,
    { name: "boxDefaults", value: defaultSetting.layout.box },
    { name: "markShape", value: mark.shape || "circle" },
    { name: "markSizeType", value: (mark.size && mark.size.type) || "max" },
    { name: "markSizeShared", value: Boolean(mark.size && mark.size.isShared) },
    { name: "colorKey", value: (mark.color && mark.color.key) || null },
    {
      name: "colorSchemeName",
      value: (mark.color && mark.color.scheme) || "category10",
    },
    // Specs name schemes the d3 way (`schemeCategory10`); vega wants
    // `category10`. Strip the prefix and lowercase the leading character.
    {
      name: "colorScheme",
      update:
        "indexof(colorSchemeName, 'scheme') === 0" +
        " ? lower(slice(colorSchemeName, 6, 7)) + slice(colorSchemeName, 7)" +
        " : colorSchemeName",
    },
  ];
}

/**
 * The text that labels one container, anchored to whichever edge
 * `labels.orient` names and nudged clear of it by `labels.offset` pixels.
 * Orientation is a signal like the mark policy is, so the same spec re-renders
 * against a different edge without being rebuilt.
 */
function buildLabelMark(): VegaMark {
  /** Choose per orientation: one value per side, one for the other axis. */
  const horizontal = (left: string, right: string, center: string): string =>
    `labelOrient === 'left' ? ${left} : labelOrient === 'right' ? ${right} : ${center}`;
  const vertical = (top: string, bottom: string, middle: string): string =>
    `labelOrient === 'top' ? ${top} : labelOrient === 'bottom' ? ${bottom} : ${middle}`;

  return {
    name: "labelMarks",
    type: "text",
    from: { data: "containerLabels" },
    encode: {
      update: {
        x: {
          scale: "xscale",
          signal: horizontal("datum.absX", "datum.absX + datum.width", "datum.absX + datum.width / 2"),
        },
        y: {
          scale: "yscale",
          signal: vertical("datum.absY", "datum.absY + datum.height", "datum.absY + datum.height / 2"),
        },
        // The offset is a pixel nudge rather than a data-space one, so it holds
        // whatever the container is sized in.
        dx: { signal: horizontal("-labelOffset", "labelOffset", "0") },
        dy: { signal: vertical("-labelOffset", "labelOffset", "0") },
        align: { signal: horizontal("'right'", "'left'", "'center'") },
        baseline: { signal: vertical("'bottom'", "'top'", "'middle'") },
        text: { signal: "'' + datum.label" },
        fontSize: { signal: "labelFontSize" },
        fill: { signal: "labelColor" },
      },
    },
  } as VegaMark;
}

/** A swatch per color-scale entry, shaped like the marks it stands for. */
function buildLegend(legend: ResolvedLegend): VegaLegend {
  return {
    fill: "colorScale",
    title: legend.title,
    orient: legend.orient,
    encode: {
      symbols: {
        update: {
          shape: { signal: "markShape === 'rect' ? 'square' : 'circle'" },
        },
      },
    },
  } as VegaLegend;
}

/**
 * Compile a spec and its rows into a vega spec that computes its own layout.
 *
 * `spec` should have been through `applyDefault` -- the layout reads the
 * defaults it fills in. The result is complete: `vega.parse` it and the chart
 * lays itself out.
 *
 * The output uses stock vega transforms, and so runs anywhere vega does, unless
 * the spec has a weighted `maxfill` level. See `isPortable`.
 */
export function buildVegaSpec(spec: Spec, rows: DataRow[]): VegaSpec {
  const labels = resolveLabels(spec);
  const legend = resolveLegend(spec);
  const decorated = Boolean(labels || legend);

  return {
    width: spec.width,
    height: spec.height,
    // The layout sizes the canvas itself, and the d3 backend draws into exactly
    // that box. Without this vega would re-pad around the mark bounds and shift
    // everything whenever a stroke or a mark spills over the edge.
    //
    // Decorations sit outside that box by construction, so a decorated chart
    // pads instead: the plot area is still exactly `spec.width` by
    // `spec.height`, and the svg around it grows to hold the labels and legend
    // rather than clipping them.
    padding: 0,
    autosize: decorated ? { type: "pad", resize: false } : { type: "none" },
    signals: buildSignals(spec, labels),
    data: buildData(spec, rows, labels),
    ...(legend ? { legends: [buildLegend(legend)] } : {}),
    scales: [
      {
        name: "xscale",
        type: "linear",
        domain: {
          fields: [
            { data: "rootBounds", field: "x0" },
            { data: "rootBounds", field: "x1" },
          ],
        },
        range: "width",
      },
      {
        name: "yscale",
        type: "linear",
        domain: {
          fields: [
            { data: "rootBounds", field: "y0" },
            { data: "rootBounds", field: "y1" },
          ],
        },
        range: "height",
        reverse: true,
      },
      {
        name: "colorScale",
        type: "ordinal",
        domain: { data: "units", field: "color" },
        range: { scheme: { signal: "colorScheme" } },
      },
    ],
    marks: [
      {
        name: "containerMarks",
        type: "rect",
        from: { data: "boxes" },
        encode: {
          update: {
            x: { scale: "xscale", field: "absX" },
            x2: { scale: "xscale", signal: "datum.absX + datum.width" },
            y: { scale: "yscale", field: "absY" },
            y2: { scale: "yscale", signal: "datum.absY + datum.height" },
            fill: { field: "boxFill" },
            opacity: { field: "boxOpacity" },
            stroke: { field: "boxStroke" },
            strokeWidth: { field: "boxStrokeWidth" },
          },
        },
      },
      {
        name: "unitMarks",
        type: "rect",
        from: { data: "rectUnits" },
        encode: {
          update: {
            x: { scale: "xscale", field: "absX" },
            x2: { scale: "xscale", signal: "datum.absX + datum.width" },
            y: { scale: "yscale", field: "absY" },
            y2: { scale: "yscale", signal: "datum.absY + datum.height" },
            fill: { scale: "colorScale", field: "color" },
            tooltip: { signal: "datum.row" },
          },
        },
      },
      {
        name: "unitArcMarks",
        type: "arc",
        from: { data: "circleUnits" },
        encode: {
          update: {
            x: { scale: "xscale", field: "cx" },
            y: { scale: "yscale", field: "cy" },
            startAngle: { value: 0 },
            endAngle: { signal: "2 * PI" },
            outerRadius: { field: "radius" },
            fill: { scale: "colorScale", field: "color" },
            tooltip: { signal: "datum.row" },
          },
        },
      },
      // Last, so the text sits over the units rather than under them.
      ...(labels ? [buildLabelMark()] : []),
    ] as VegaMark[],
  };
}

/**
 * Whether `buildVegaSpec` will emit a spec a bare vega runtime can run.
 *
 * A weighted `maxfill` level is a squarified treemap, which is the one part of
 * the grammar that needs a transform vega does not ship -- see
 * `treemap-transform.ts`. Everything else compiles to stock transforms, so the
 * emitted spec can be handed to the Vega Editor, `vega-embed`, or the vega CLI
 * as it stands.
 */
export function isPortable(spec: Spec): boolean {
  return !spec.layouts.some(
    (layout) =>
      layout.aspect_ratio === "maxfill" &&
      Boolean(layout.size) &&
      Boolean(layout.size!.type) &&
      layout.size!.type !== "uniform",
  );
}

/**
 * Mounts the chart in the element with id `divId` and returns the live view.
 *
 * This drives vega's `View` directly rather than going through `vega-embed`,
 * which is what keeps this package's dependency list to vega alone. What
 * vega-embed would have added on top is an actions menu; the view it hands back
 * can still render itself to an image (`view.toImageURL`), which is what that
 * menu's useful entry did.
 */
export default async function drawUnitVega(
  spec: Spec,
  rows: DataRow[],
  divId: string,
): Promise<View> {
  const target = document.getElementById(divId);
  if (!target) {
    throw new Error(`No element with id "${divId}" to draw into.`);
  }
  const view = new View(parse(buildVegaSpec(spec, rows)), {
    renderer: "svg",
    container: target,
    // Marks carry a `tooltip` encoding, and without hover processing nothing
    // ever asks for it.
    hover: true,
  });
  await view.runAsync();
  return view;
}
