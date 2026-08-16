import embed from "vega-embed";
import type {
  Data as VegaData,
  Mark as VegaMark,
  Signal as VegaSignal,
  Spec as VegaSpec,
} from "vega-typings";
import { defaultSetting } from "./constants";

import type { Container, Mark, Spec } from "./index.d";

/**
 * The layout engine hands us a container tree whose depth is one level per
 * entry in `spec.layouts`. Every node carries a `visualspace` whose
 * `posX`/`posY` are relative to its parent, and the deepest containers hold a
 * single data row apiece.
 *
 * Rather than walking that tree in JS and shipping a flat list of pre-baked
 * pixel positions, we hand vega the tree itself and let the dataflow do the
 * work:
 *
 *   - one `flatten` per layout level descends the tree,
 *   - `formula` accumulates each parent offset into an absolute position,
 *   - `filter` splits every level into "still a container" (draw a box) and
 *     "holds a datum" (draw a unit mark),
 *   - `joinaggregate` implements the shared mark-size policy,
 *   - `lookup` against the layout list resolves per-level box styling,
 *   - signals carry the mark policy, so shape/size/color are encoding-time
 *     decisions rather than spec-construction-time branches.
 */

/** A node whose children are containers, so it renders as a layout box. */
const HAS_CONTAINER_CHILDREN =
  "datum.contents && length(datum.contents) >= 1 && datum.contents[0].visualspace";

/** A node that bottoms out in a data row, so it renders as a unit mark. */
const HAS_DATUM_CHILD =
  "datum.contents && length(datum.contents) >= 1 && !datum.contents[0].visualspace";

/**
 * Descends one level of the container tree.
 *
 * `flatten` copies the parent tuple's fields onto each child, so `datum.absX`
 * still holds the parent's absolute position when the offset formulas run.
 * `project` then drops the container's cyclic `parent`/`layout`
 * back-references before we rebuild the fields we care about off the child.
 */
function descendLevel(depth: number): VegaData {
  return {
    name: `level${depth}`,
    source: `level${depth - 1}_boxes`,
    transform: [
      { type: "flatten", fields: ["contents"], as: ["node"] },
      {
        type: "project",
        fields: ["absX", "absY", "node"],
        as: ["parentX", "parentY", "node"],
      },
      {
        type: "formula",
        as: "absX",
        expr: "datum.parentX + datum.node.visualspace.posX",
      },
      {
        type: "formula",
        as: "absY",
        expr: "datum.parentY + datum.node.visualspace.posY",
      },
      { type: "formula", as: "width", expr: "datum.node.visualspace.width" },
      { type: "formula", as: "height", expr: "datum.node.visualspace.height" },
      { type: "formula", as: "contents", expr: "datum.node.contents" },
      { type: "formula", as: "depth", expr: `${depth}` },
    ],
  };
}

/** Splits a level into the nodes that draw boxes and the ones that draw marks. */
function partitionLevel(depth: number): VegaData[] {
  return [
    {
      name: `level${depth}_boxes`,
      source: `level${depth}`,
      transform: [{ type: "filter", expr: HAS_CONTAINER_CHILDREN }],
    },
    {
      name: `level${depth}_leaves`,
      source: `level${depth}`,
      transform: [{ type: "filter", expr: HAS_DATUM_CHILD }],
    },
  ];
}

function buildData(rootContainer: Container, spec: Spec): VegaData[] {
  const numLayouts = spec.layouts.length;

  // Depth 0 is the root container itself. Project first so its cyclic
  // `parent`/`layout` fields never reach the rest of the dataflow.
  const data: VegaData[] = [
    {
      name: "level0",
      values: [rootContainer],
      transform: [
        {
          type: "project",
          fields: ["visualspace", "contents"],
          as: ["visualspace", "contents"],
        },
        { type: "formula", as: "absX", expr: "datum.visualspace.posX" },
        { type: "formula", as: "absY", expr: "datum.visualspace.posY" },
        { type: "formula", as: "width", expr: "datum.visualspace.width" },
        { type: "formula", as: "height", expr: "datum.visualspace.height" },
        { type: "formula", as: "depth", expr: "0" },
      ],
    },
    ...partitionLevel(0),
  ];

  for (let depth = 1; depth <= numLayouts; depth++) {
    data.push(descendLevel(depth), ...partitionLevel(depth));
  }

  // The drawing surface, read off the root container rather than off the spec.
  data.push({
    name: "rootBounds",
    source: "level0",
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
    boxSources.push(`level${depth}`);
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

  // Unit marks: whichever level each branch of the tree bottoms out at.
  const leafSources: string[] = [];
  for (let depth = 0; depth <= numLayouts; depth++) {
    leafSources.push(`level${depth}_leaves`);
  }
  data.push({
    name: "units",
    source: leafSources,
    transform: [
      { type: "formula", as: "row", expr: "datum.contents[0]" },
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

function buildSignals(spec: Spec): VegaSignal[] {
  // `applyDefault` normally fills this in, but the type allows it to be absent.
  const mark: Partial<Mark> = spec.mark ?? {};
  return [
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

export function buildVegaSpec(container: Container, spec: Spec): VegaSpec {
  return {
    width: spec.width,
    height: spec.height,
    // The layout engine already sized the canvas, and the d3 backend draws into
    // exactly that box. Without this vega would re-pad around the mark bounds
    // and shift everything whenever a stroke or a mark spills over the edge.
    padding: 0,
    autosize: { type: "none" },
    signals: buildSignals(spec),
    data: buildData(container, spec),
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
    ] as VegaMark[],
  };
}

export default function drawUnitVega(
  container: Container,
  spec: Spec,
  divId: string,
): Promise<unknown> {
  const newSpec = buildVegaSpec(container, spec);
  return embed(`#${divId}`, newSpec, {
    mode: "vega",
    renderer: "svg",
    // The container tree and the layout list are both cyclic, so the menu
    // entries that JSON-serialize the spec would throw. Image export renders
    // from the view and is unaffected.
    actions: { export: true, source: false, compiled: false, editor: false },
  });
}
