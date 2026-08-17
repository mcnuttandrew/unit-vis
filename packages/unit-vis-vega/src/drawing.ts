import { View, parse } from "vega";
import type {
  Axis as VegaAxis,
  Data as VegaData,
  Legend as VegaLegend,
  Mark as VegaMark,
  Scale as VegaScale,
  Signal as VegaSignal,
  Spec as VegaSpec,
  Transforms,
} from "vega";
import { Handler as TooltipHandler } from "vega-tooltip";
import { defaultSetting } from "@unit-vis/core";

import type {
  DataRow,
  Labels,
  Layout,
  Legend,
  Mark,
  MarkContent,
  Padding,
  Spec,
} from "@unit-vis/core";
import {
  ROWS_BY_ID,
  buildLayoutData,
  isTreemap,
  isWeightedPack,
  levelName,
} from "./layout.js";

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
 *     decisions rather than spec-construction-time branches -- including what
 *     the emoji/text/path/image shapes draw, which rides on a signal too.
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
 *
 * `orient` has no default of its own: an axis takes the side its level divides
 * space along unless the spec names one. See `sideFor`.
 */
const labelDefaults: Required<Omit<Labels, "layouts" | "orient">> = {
  offset: 4,
  fontSize: 10,
  color: "#333333",
};
const legendDefaults: Required<Omit<Legend, "title">> = { orient: "right" };

/** Subgroup types whose containers carry a label worth printing. */
const NAMING_SUBGROUPS = new Set(["groupby", "bin"]);

/**
 * The field the engine stamps on every row before layout, holding the row's
 * index. Grouping by it is a `flatten` written another way -- one container
 * per row, labelled with a row number -- so it is left out of the annotation
 * for the same reason a `flatten` is.
 */
const ROW_ID = "id";

/** Whether this level splits its rows into groups a reader can be told about. */
function namesItsGroups(layout: Layout): boolean {
  const { type, key } = layout.subgroup;
  return NAMING_SUBGROUPS.has(type) && !(type === "groupby" && key === ROW_ID);
}

type AxisOrient = "top" | "bottom" | "left" | "right";

/** The directions a level lays its containers out along. */
type Spread = "x" | "y" | "both" | "none";

/**
 * Which way a level spreads the containers it produces: `fillX` across,
 * `fillY` up, and every packing ratio over both at once, since it wraps its
 * groups into a grid. A `passthrough` level makes one child per container and
 * so spreads nothing, whatever ratio it was given.
 */
function spreadOf(layout: Layout): Spread {
  if (layout.subgroup.type === "passthrough") {
    return "none";
  }
  switch (layout.aspect_ratio) {
    case "fillX":
      return "x";
    case "fillY":
      return "y";
    default:
      return "both";
  }
}

/**
 * How a level's groups can be annotated, from where that level put them.
 *
 * An axis is a description of one thing: a run of groups along one direction,
 * each in one place. Their spacing may vary from parent to parent -- a
 * mosaic's splits are sized by what is in them -- but their order does not,
 * and each group stays within the band its containers occupy. That is the
 * `axis` case.
 *
 * A level packing its groups into a grid puts them at as many positions down
 * as across, so no edge orders them: an axis along the bottom of a 4x4 grid of
 * age bins would run 21, 0, 5, 10, 16 and mean nothing. Each group is
 * somewhere of its own, though, so each can be named there -- the `cells`
 * case.
 *
 * A level laid out inside an ancestor that already spread its own groups the
 * same way is a run along an edge repeated at every one of that ancestor's
 * positions. Every group is in several places, so an axis would have to pick
 * one, but the run is the same run each time: naming it once, on the copy
 * against the edge, says everything the repeats would. That is `edge`.
 */
function annotationFor(layout: Layout, ancestors: Layout[]): Annotation {
  const spread = spreadOf(layout);
  if (spread !== "x" && spread !== "y") {
    return "cells";
  }
  const repeated = ancestors.some((ancestor) => {
    const outer = spreadOf(ancestor);
    return outer === "both" || outer === spread;
  });
  return repeated ? "edge" : "axis";
}

/**
 * The edge a level's groups are read against, from the way it divides space: a
 * `fillX` level lays its children out across, so they are read along the
 * bottom; a `fillY` level stacks them up, so they are read up the left. A level
 * that packs its groups into a grid is read the way a table of small multiples
 * is, with a heading over each cell.
 */
function sideFor(layout: Layout): AxisOrient {
  const spread = spreadOf(layout);
  return spread === "y" ? "left" : spread === "x" ? "bottom" : "top";
}

/** Room an axis takes outside the plot area, past the text itself. */
const AXIS_TICK_SIZE = 5;
const AXIS_LABEL_PADDING = 2;
const AXIS_TITLE_PADDING = 4;
/** Gap left between two axes stacked on the same side. */
const AXIS_GAP = 4;
/** Advance width of a sans-serif glyph, as a fraction of the type size. */
const GLYPH_WIDTH = 0.6;
/**
 * How much of a level has to fit its labels before any of them are drawn. Half
 * is a judgement rather than a measurement: enough that the odd container too
 * small to name -- the sliver band, the empty bin -- does not cost the level
 * its labels, and little enough that a level only a fraction of which can be
 * named is left alone.
 */
const LABEL_QUORUM = 0.5;

/**
 * What a level's groups get, which is decided by where that level put them.
 *
 * - `axis` -- they are a run along one edge, so they get ticks on it.
 * - `edge` -- they are a run along one edge repeated inside every cell of some
 *   level above, so an axis would have each of them in several places at once.
 *   They are named once instead, on the copy nearest the edge they run along.
 * - `cells` -- they are packed into a grid, so each one is somewhere of its
 *   own and gets its name written over it, the way a table of small multiples
 *   heads its cells.
 */
type Annotation = "axis" | "edge" | "cells";

/** One annotated level: what is drawn for it, where, and off which level. */
interface ResolvedAxis {
  /** Depth of the level it reads, i.e. `spec.layouts` index + 1. */
  depth: number;
  orient: AxisOrient;
  /** The field the level splits on, or null when it splits on nothing. */
  title: string | null;
  /** The level itself: where the text goes and what it says comes off it. */
  layout: Layout;
  kind: Annotation;
  /**
   * The extent signals of whatever is stacked between this one and the plot
   * edge. Summed, they are how far out this has to sit to clear them. A
   * `cells` level is drawn over the chart rather than against an edge, so it
   * neither reads this nor takes room from anything else.
   */
  inside: string[];
}

interface ResolvedAxes extends Required<Omit<Labels, "layouts" | "orient">> {
  /** Every annotated level, in spec order, axes and labelled ones alike. */
  levels: ResolvedAxis[];
}

interface ResolvedLegend extends Required<Omit<Legend, "title">> {
  title: string;
}

/** The dataset of tick positions read off one level's containers. */
const axisData = (depth: number): string => `axis${depth}`;
/** The scale that pairs that level's labels with those positions. */
const axisScale = (depth: number): string => `axisScale${depth}`;
/** How far the axis reaches out from the plot edge, text included. */
const axisExtent = (depth: number): string => `axisExtent${depth}`;
/** The containers of a level labelled in place rather than given an axis. */
const labelData = (depth: number): string => `labels${depth}`;
/** Which annotation a level ended up with, and where it is drawn. */
const isAxis = (level: ResolvedAxis): boolean => level.kind === "axis";
const isLabelled = (level: ResolvedAxis): boolean => level.kind !== "axis";
/** Whether it sits against an edge of the chart, so that things stack on it. */
const atEdge = (level: ResolvedAxis): boolean => level.kind !== "cells";
/**
 * The text mark drawing them. `test/harness/svg-model.ts` skips these by name,
 * so renaming one means updating `DECORATION_MARK_NAMES` there.
 */
const labelMark = (depth: number): string => `labelMarks${depth}`;

/**
 * `spec.labels` picks which layout levels are annotated, and each level's own
 * shape decides what it gets.
 *
 * A level whose groups run along one edge gets an axis, which is the whole
 * point of the option: ticks in order, a title, and text outside the chart
 * rather than over it. A level whose groups are not a run along an edge -- the
 * packed grids and the repeated splits `isReadableAsAxis` rules out -- cannot
 * be described that way, so its containers are labelled where they sit
 * instead. That is a worse annotation than an axis and a better one than
 * nothing: the groups of a packed level are still named, just one cell at a
 * time.
 *
 * Left to itself the selection takes the levels that name their groups, less
 * two kinds it would be drawing over something already there.
 *
 * A `flatten` level is one: it labels its containers by position within the
 * group, a row number rather than anything a reader wants on the chart. The
 * level split on the field the legend explains is the other -- a chart that
 * splits space by species and colors by species has said species once, and a
 * guide for each says it twice. The legend keeps it, being the one that names
 * every group whatever the layout did with it. Turning the legend off gives
 * that level its axis back.
 *
 * The selection also takes at most one level written over the chart, the
 * outermost, because those do not stack: a nested one writes its groups once
 * inside every cell of the level above it, into the same strip of margin that
 * level's own labels are already in. One is a chart with its groups named; two
 * is the pile of overlapping text this option used to draw.
 *
 * Naming levels through `layouts` overrides the selection, but not the choice
 * above -- what is drawn for a level is a fact about the level, not about how
 * it was picked. A spec that names two labelled levels gets both, overlapping
 * or not.
 *
 * Axes that land on the same side are stacked outward, the deepest closest to
 * the plot -- so a chart read against one edge has its finest split next to the
 * marks and the coarser ones beyond it, the way nested axes usually go.
 */
function resolveAxes(spec: Spec, explained: string | null): ResolvedAxes | null {
  if (!spec.labels) {
    return null;
  }
  const options: Labels = spec.labels === true ? {} : spec.labels;
  const wanted = options.layouts;
  const selected = spec.layouts
    .map((layout, index) => ({
      layout,
      depth: index + 1,
      kind: annotationFor(layout, spec.layouts.slice(0, index)),
    }))
    .filter(({ layout }) =>
      wanted
        ? Boolean(layout.name) && wanted.indexOf(layout.name!) >= 0
        : Boolean(layout.subgroup) &&
          namesItsGroups(layout) &&
          layout.subgroup.key !== explained,
    )
    // At most one level written over the chart unless the spec asked for more
    // by name. The outermost is the one to keep: an inner level is drawn once
    // per cell of the level outside it, into the same strip of margin.
    .filter(
      ({ kind, depth }, _index, all) =>
        Boolean(wanted) ||
        kind !== "cells" ||
        depth === all.find((level) => level.kind === "cells")!.depth,
    );

  if (!selected.length) {
    return null;
  }

  // Deepest first, so that the stacking below runs inside-out per side.
  const stacked = new Map<AxisOrient, number[]>();
  const levels = selected
    .slice()
    .sort((a, b) => b.depth - a.depth)
    .map(({ layout, depth, kind }) => {
      const orient = options.orient ?? sideFor(layout);
      const edge = kind !== "cells";
      const inside = edge ? (stacked.get(orient) ?? []) : [];
      if (edge) {
        stacked.set(orient, [...inside, depth]);
      }
      return {
        depth,
        orient,
        title: layout.subgroup.key ?? null,
        layout,
        kind,
        inside: inside.map(axisExtent),
      };
    })
    // Back into spec order, so the emitted axes read the way the spec does.
    .sort((a, b) => a.depth - b.depth);

  return {
    offset: options.offset ?? labelDefaults.offset,
    fontSize: options.fontSize ?? labelDefaults.fontSize,
    color: options.color ?? labelDefaults.color,
    levels,
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

/**
 * The shapes that have to be told what to draw, each named by the `mark` field
 * that tells them: `mark.emoji`, `mark.text`, `mark.path`, `mark.image`.
 * `circle` and `rect` need no content and are always available.
 */
const CONTENT_CHANNELS = ["emoji", "text", "path", "image"] as const;
type ContentChannel = (typeof CONTENT_CHANNELS)[number];

/** The field on a unit that a channel reads off the row, before any scale. */
const valueField = (channel: ContentChannel): string => `${channel}Value`;
/** The field on a unit that a channel's resolved content lands in. */
const contentField = (channel: ContentChannel): string => `${channel}Content`;
/** The signal carrying the channel's `key`, literal value, and default. */
const contentSignal = (channel: ContentChannel): string => `${channel}Spec`;
/** The signals carrying the two halves of the channel's scale. */
const domainSignal = (channel: ContentChannel): string => `${channel}Domain`;
const rangeSignal = (channel: ContentChannel): string => `${channel}Range`;
/** The scale that pairs the channel's domain with its range. */
const channelScale = (channel: ContentChannel): string => `${channel}Scale`;
/** The units the channel's mark draws from. */
const channelUnits = (channel: ContentChannel): string => `${channel}Units`;
/**
 * The mark itself. `test/harness/svg-model.ts` reads a mark's role off this
 * name, so renaming one means updating `UNIT_MARK_NAMES` there.
 */
const channelMark = (channel: ContentChannel): string =>
  `unit${channel[0].toUpperCase()}${channel.slice(1)}Marks`;

/** Whether `mark.<channel>` says anything about what to draw. */
function hasContent(content: MarkContent | undefined): boolean {
  return typeof content === "string"
    ? content.length > 0
    : Boolean(content && content.key);
}

/**
 * The channels this spec configured.
 *
 * A shape whose channel is empty has nothing to draw, so its mark is left out
 * of the compiled spec and `markShape` falls through to circles — which is also
 * what a spec written before these shapes existed compiles to, unchanged.
 */
function contentChannels(mark: Partial<Mark>): ContentChannel[] {
  return CONTENT_CHANNELS.filter((channel) => hasContent(mark[channel]));
}

/** The object form of a channel's content, or null for a literal. */
function scaled(content: MarkContent): Exclude<MarkContent, string> | null {
  return typeof content === "string" ? null : content;
}

/** Whether the channel pairs the field's values with something else to draw. */
function hasRange(content: MarkContent): boolean {
  const object = scaled(content);
  return Boolean(object && object.range && object.range.length);
}

/**
 * The channel's configuration, as signals.
 *
 * All of it rides on signals rather than being baked into expressions and scale
 * definitions, so a live view can be re-pointed at a different field or handed
 * a different set of emoji without the spec being rebuilt.
 */
function contentSignals(channel: ContentChannel, content: MarkContent): VegaSignal[] {
  const object = scaled(content);
  return [
    {
      name: contentSignal(channel),
      value: {
        key: object ? object.key : null,
        value: object ? null : content,
        default: object && object.default != null ? object.default : null,
      },
    },
    // A domain with nothing to pair it with is not a scale, so both halves are
    // carried only when there is a range.
    ...(hasRange(content)
      ? [
          { name: domainSignal(channel), value: object!.domain ?? null },
          { name: rangeSignal(channel), value: object!.range },
        ]
      : []),
  ];
}

/** What the channel reads off one row, before its scale gets a say. */
function valueExpr(channel: ContentChannel): string {
  const signal = contentSignal(channel);
  return `isValid(${signal}.key) ? toString(datum.row[${signal}.key]) : ${signal}.value`;
}

/**
 * What one unit actually draws: the value it read, run through the channel's
 * scale where it has one.
 *
 * A value the domain does not list is drawn with `default` rather than being
 * folded into the scale, which is the one place this parts company with an
 * ordinal scale -- vega would hand an unlisted value a range entry of its own.
 */
function contentExpr(channel: ContentChannel, content: MarkContent): string {
  const value = `datum.${valueField(channel)}`;
  if (!hasRange(content)) {
    return value;
  }
  const domain = domainSignal(channel);
  return (
    `isValid(${domain}) && indexof(${domain}, ${value}) < 0` +
    ` ? ${contentSignal(channel)}.default` +
    ` : scale('${channelScale(channel)}', ${value})`
  );
}

/**
 * The scale itself, when the channel has a range to pair its values with.
 *
 * With no domain of its own it reads one off the units, in the order the values
 * first appear -- which is what an ordinal scale does, and the same order the
 * color scale reads its own domain in.
 */
function buildContentScale(channel: ContentChannel, content: MarkContent): VegaScale {
  const object = scaled(content)!;
  return {
    name: channelScale(channel),
    type: "ordinal",
    domain: object.domain
      ? { signal: domainSignal(channel) }
      : { data: "units", field: valueField(channel) },
    range: { signal: rangeSignal(channel) },
  } as VegaScale;
}

/**
 * How the two channels drawn as text arrive at a type size, when `mark.fontSize`
 * does not simply say. Both are measured against the container, so a denser
 * layout writes smaller.
 */
const FONT_SIZE: { [channel in ContentChannel]?: Transforms[] } = {
  // A glyph is about one em tall, so an emoji set to the container's inscribed
  // diameter fills it the way a circle mark does -- and `datum.radius` has
  // already been through the shared-size policy, so this follows it.
  emoji: [
    {
      type: "formula",
      as: "fontSize",
      expr: "isValid(markFontSize) ? markFontSize : 2 * datum.radius",
    },
  ],
  // Text has to fit across as well as down, and the room it has across is the
  // container's own width rather than the square the other shapes are drawn in.
  // 0.6em is a serviceable stand-in for the average advance width of a
  // sans-serif glyph, so this is the largest size at which the string is still
  // expected to sit inside its container.
  text: [
    {
      type: "formula",
      as: "__fit",
      expr:
        `!isValid(datum.${contentField("text")}) ? null` +
        ` : min(2 * datum.radius, datum.width / (0.6 * max(1, length('' + datum.${contentField("text")}))))`,
    },
    // That width is per container, so unlike `datum.radius` it has not been
    // through the size policy yet. A shared policy is a min across the chart
    // here exactly as it is there: one type size, the one that fits everywhere.
    {
      type: "joinaggregate",
      fields: ["__fit"],
      ops: ["min"],
      as: ["__sharedFit"],
    },
    {
      type: "formula",
      as: "fontSize",
      expr:
        "isValid(markFontSize) ? markFontSize" +
        " : markSizeShared ? datum.__sharedFit : datum.__fit",
    },
  ],
};

/**
 * The mark each channel is drawn with, past the position and the tooltip every
 * one of them shares.
 *
 * All four are centered on their container and sized off `datum.radius`, the
 * same field the circle mark reads — so `mark.size` governs them all, and
 * switching `markShape` between them moves nothing but the shape.
 */
const CONTENT_ENCODINGS: {
  [channel in ContentChannel]: {
    type: string;
    update: Record<string, unknown>;
  };
} = {
  // No fill: an emoji carries its own colors, and painting over them would only
  // show up on the platforms whose emoji font is monochrome.
  emoji: {
    type: "text",
    update: {
      text: { field: contentField("emoji") },
      fontSize: { field: "fontSize" },
      align: { value: "center" },
      baseline: { value: "middle" },
      // Vega's default font is whatever the platform calls `sans-serif`, which
      // on a machine whose sans-serif has no emoji coverage draws every glyph
      // as a missing-character box. Name the emoji fonts ahead of it.
      font: {
        value: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
      },
    },
  },
  text: {
    type: "text",
    update: {
      text: { field: contentField("text") },
      fontSize: { field: "fontSize" },
      align: { value: "center" },
      baseline: { value: "middle" },
      fill: { scale: "colorScale", field: "color" },
    },
  },
  // Vega draws a custom symbol path scaled by `sqrt(size) / 2`, so a path drawn
  // in the box from (-1, -1) to (1, 1) comes out exactly `2 * radius` across.
  path: {
    type: "symbol",
    update: {
      shape: { field: contentField("path") },
      size: { signal: "pow(2 * datum.radius, 2)" },
      fill: { scale: "colorScale", field: "color" },
    },
  },
  // Both dimensions are given, so vega never has to load the picture to size it
  // -- and `preserveAspectRatio` then fits it inside that square rather than
  // stretching it.
  image: {
    type: "image",
    update: {
      url: { field: contentField("image") },
      width: { signal: "2 * datum.radius" },
      height: { signal: "2 * datum.radius" },
      align: { value: "center" },
      baseline: { value: "middle" },
    },
  },
};

function buildContentMark(channel: ContentChannel): VegaMark {
  const { type, update } = CONTENT_ENCODINGS[channel];
  return {
    name: channelMark(channel),
    type,
    from: { data: channelUnits(channel) },
    encode: {
      update: {
        x: { scale: "xscale", field: "cx" },
        y: { scale: "yscale", field: "cy" },
        tooltip: { signal: "datum.row" },
        ...update,
      },
    },
  } as VegaMark;
}

function buildData(
  spec: Spec,
  rows: DataRow[],
  axes: ResolvedAxes | null,
): VegaData[] {
  const numLayouts = spec.layouts.length;
  const channels = contentChannels(spec.mark ?? {});

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
      // What each of the told-what-to-draw shapes reads off the row, for every
      // unit rather than only for the shape in play -- so `markShape` can be
      // flipped between the shapes the spec configured after the fact. This is
      // also what a channel's scale reads its domain off, so it stays here
      // rather than moving downstream with the content it resolves to.
      ...channels.map((channel) => ({
        type: "formula" as const,
        as: valueField(channel),
        expr: valueExpr(channel),
      })),
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

  // One dataset per annotated level: the ticks of an axis, or the containers
  // of a level labelled where it sits.
  if (axes) {
    axes.levels.forEach((level) =>
      data.push(level.kind === "axis" ? buildAxisData(level) : buildLabelData(level)),
    );
  }

  // Shape selection is a filter over a signal rather than a JS branch, so
  // flipping `markShape` reshapes the chart without rebuilding the spec.
  // Circles are the fallback: a shape with no mark of its own -- one the spec
  // gave no content, or one nobody has heard of -- lands here.
  const claimed = ["rect", ...channels];
  data.push(
    {
      name: "rectUnits",
      source: "units",
      transform: [{ type: "filter", expr: "markShape === 'rect'" }],
    },
    {
      name: "circleUnits",
      source: "units",
      transform: [
        {
          type: "filter",
          expr: `indexof([${claimed.map((shape) => `'${shape}'`).join(", ")}], markShape) < 0`,
        },
      ],
    },
    ...channels.map((channel) => ({
      name: channelUnits(channel),
      source: "units",
      transform: [
        { type: "filter" as const, expr: `markShape === '${channel}'` },
        // Downstream of `units` rather than in it, because a channel's scale
        // reads its domain off `units` -- resolving the content there would
        // have the dataset depending on a scale that depends on it.
        {
          type: "formula" as const,
          as: contentField(channel),
          expr: contentExpr(channel, spec.mark![channel]!),
        },
        // After the content, so text is fitted to the string it will draw
        // rather than to the value it was mapped from.
        ...(FONT_SIZE[channel] ?? []),
      ],
    })),
  );

  return data;
}

function buildSignals(spec: Spec, axes: ResolvedAxes | null): VegaSignal[] {
  // `applyDefault` normally fills this in, but the type allows it to be absent.
  const mark: Partial<Mark> = spec.mark ?? {};
  const channels = contentChannels(mark);
  // What each configured shape draws, and the type size the two textual ones
  // are drawn at. Both are signals so that a live view can be re-pointed at a
  // different field or a different size without recompiling.
  const markSignals: VegaSignal[] = [
    ...channels.flatMap((channel) => contentSignals(channel, mark[channel]!)),
    ...(channels.some((channel) => FONT_SIZE[channel])
      ? [{ name: "markFontSize", value: mark.fontSize ?? null }]
      : []),
  ];
  // The axis styling, and then one signal per axis for the room it needs --
  // which is what the axes stacked outside it are placed against. Both halves
  // are signals so that a live view can be re-sized or re-colored in place, and
  // so that the stacking follows when it is.
  const axisSignals: VegaSignal[] = axes
    ? [
        { name: "labelOffset", value: axes.offset },
        { name: "labelFontSize", value: axes.fontSize },
        { name: "labelColor", value: axes.color },
        ...axes.levels.filter(atEdge).map(buildAxisExtentSignal),
      ]
    : [];
  return [
    ...axisSignals,
    ...markSignals,
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

/** Whether an axis on this side runs across the chart rather than up it. */
const isHorizontal = (axis: ResolvedAxis): boolean =>
  axis.orient === "top" || axis.orient === "bottom";

/**
 * Whether the level runs its containers against the axis, i.e. the first one
 * placed sits at the far end rather than at the origin. Only the letters for
 * the axis in play are read: a `fillX` level's horizontal sense, a `fillY`
 * level's vertical one.
 */
function isReversed(axis: ResolvedAxis): boolean {
  const direction = axis.layout.direction ?? "LRBT";
  return isHorizontal(axis)
    ? direction.indexOf("RL") >= 0
    : direction.indexOf("TB") >= 0;
}

/**
 * Where the tick for one container goes, in layout space.
 *
 * A categorical group is a place on the axis rather than a value, so its tick
 * sits at the middle of the box. A bin *is* a value -- its own lower edge -- so
 * its tick sits on the boundary between it and the bin below, which is the box
 * edge plus back the margin the level took out around it. Ticks on the
 * boundaries and numbers between them is what makes a histogram axis readable
 * as a scale rather than as a row of ranges.
 */
function tickPosition(axis: ResolvedAxis, bin: boolean): string {
  const margin: Partial<Padding> = axis.layout.margin ?? {};
  const reversed = isReversed(axis);
  if (isHorizontal(axis)) {
    if (!bin) {
      return "scale('xscale', datum.absX + datum.width / 2)";
    }
    return reversed
      ? `scale('xscale', datum.absX + datum.width + ${margin.right ?? 0})`
      : `scale('xscale', datum.absX - ${margin.left ?? 0})`;
  }
  if (!bin) {
    return "scale('yscale', datum.absY + datum.height / 2)";
  }
  // Screen y grows downward, so the low end of a bottom-to-top level is the
  // bottom edge of its box.
  return reversed
    ? `scale('yscale', datum.absY - ${margin.top ?? 0})`
    : `scale('yscale', datum.absY + datum.height + ${margin.bottom ?? 0})`;
}

/**
 * What one container's annotation says.
 *
 * A `bin` level's container is labelled with the interval it holds, printed
 * from its edges as `3150-3675.00000000000005` -- twenty characters of float
 * noise where a reader wants a number. The engine leaves the edges themselves
 * on the container, so both forms here are built from those instead: an axis
 * tick takes the lower edge alone, since the next tick along is the other end
 * of the interval, and a label standing on its own container takes the range.
 *
 * Anything else prints the container's label as it is -- that is the group's
 * own value, and there is nothing to improve.
 */
function binOrLabelText(bin: boolean, range: boolean): string {
  if (!bin) {
    return "'' + datum.label";
  }
  // A range prints two numbers across the width of one container, so it is cut
  // to four significant digits where a tick, printing one number with the room
  // of a whole axis, keeps six.
  const edge = (field: string): string =>
    `format(datum.${field}, '${range ? ".4~r" : ".6~r"}')`;
  const printed = range ? `${edge("__x0")} + '-' + ${edge("__x1")}` : edge("__x0");
  return `isValid(datum.__x0) ? ${printed} : '' + datum.label`;
}

/**
 * Where one level's ticks go and what they say: one per distinct label, in the
 * plot's own pixel space.
 *
 * The aggregate is what turns containers into an axis. A level is drawn once
 * however many parents it was split under -- three species inside each of two
 * islands is six containers and three ticks -- so the tick sits at the mean of
 * the containers it stands for. On the levels an axis is meaningful for, the
 * ones whose subgroups are shared and line up across their parents, every one
 * of those containers is at the same place along the axis and the mean is that
 * place. On the ones it is not, the tick lands between them.
 */
function buildAxisData(axis: ResolvedAxis): VegaData {
  const bin = axis.layout.subgroup.type === "bin";
  const text = binOrLabelText(bin, false);
  return {
    name: axisData(axis.depth),
    source: levelName(axis.depth),
    transform: [
      // A `bin` level opens with a container for the rows whose value was
      // blank. It holds no interval, so it has no place on a numeric axis.
      ...(bin
        ? [{ type: "filter" as const, expr: `datum.k${axis.depth} >= 0` }]
        : []),
      { type: "formula", as: "__text", expr: text },
      { type: "formula", as: "__pos", expr: tickPosition(axis, bin) },
      // Carried along so the stacking below can tell how wide the text is
      // without measuring it.
      { type: "formula", as: "__len", expr: "length(datum.__text)" },
      {
        type: "aggregate",
        groupby: ["__text"],
        fields: ["__pos", "__len"],
        ops: ["mean", "max"],
        as: ["pos", "len"],
      },
      // Vega culls overlapping labels in the order it finds them, which is only
      // the right order if they run along the axis.
      { type: "collect", sort: { field: "pos" } },
    ],
  };
}

/**
 * The scale the axis is drawn from: this level's labels against the pixel
 * positions of its containers.
 *
 * Both halves are plucked from the one dataset rather than referenced as data,
 * so they stay index-aligned -- an ordinal scale pairs its domain with its
 * range by position, and the two would have to be deduplicated identically for
 * a pair of data references to line up.
 */
function buildAxisScale(axis: ResolvedAxis): VegaScale {
  const data = axisData(axis.depth);
  return {
    name: axisScale(axis.depth),
    type: "ordinal",
    domain: { signal: `pluck(data('${data}'), '__text')` },
    range: { signal: `pluck(data('${data}'), 'pos')` },
  } as VegaScale;
}

/**
 * How far out of the plot an annotation against an edge reaches: its ticks if
 * it has them, its text, and its title if it has one. Only what is stacked
 * outside it reads this, and what that needs is the room to clear.
 *
 * Sideways, the text runs away from the plot rather than along it, so the
 * reach is the longest label rather than one line of type. Vega has measured
 * that text by the time this is read, but not anywhere an expression can ask,
 * so this estimates it from the character count.
 */
function buildAxisExtentSignal(level: ResolvedAxis): VegaSignal {
  const axis = level.kind === "axis";
  const data = axis ? axisData(level.depth) : labelData(level.depth);
  const fixed = (axis ? AXIS_TICK_SIZE + AXIS_LABEL_PADDING : 0) + AXIS_GAP;
  const longest = `extent(pluck(data('${data}'), 'len'))[1]`;
  const text = isHorizontal(level)
    ? "labelFontSize"
    : `${GLYPH_WIDTH} * labelFontSize * (isValid(${longest}) ? ${longest} : 0)`;
  // A title is one more line of type, whichever way it faces -- vega rotates it
  // to run along the edge it titles. Labels get one too, drawn as an axis with
  // nothing but its title, so it takes the same room.
  const title = level.title ? ` + labelFontSize + ${AXIS_TITLE_PADDING}` : "";
  return { name: axisExtent(level.depth), update: `${fixed} + ${text}${title}` };
}

/**
 * One level's axis. `labels.offset` holds every axis that far clear of the
 * plot, and the extents of the axes stacked inside this one push it out past
 * them.
 */
function buildAxis(axis: ResolvedAxis): VegaAxis {
  return {
    scale: axisScale(axis.depth),
    orient: axis.orient,
    offset: { signal: ["labelOffset", ...axis.inside].join(" + ") },
    ...(axis.title ? { title: axis.title } : {}),
    tickSize: AXIS_TICK_SIZE,
    labelPadding: AXIS_LABEL_PADDING,
    titlePadding: AXIS_TITLE_PADDING,
    // A unit chart sizes its groups by what is in them, so there is nothing
    // stopping two narrow ones from colliding. `greedy` keeps a label only if
    // it clears the last one kept, which is the strategy that holds up when the
    // ticks are unevenly spaced -- and unevenly spaced is the normal case here,
    // since a group's place on the axis is decided by how much data is in it.
    labelOverlap: "greedy",
    labelFontSize: { signal: "labelFontSize" },
    labelColor: { signal: "labelColor" },
    titleFontSize: { signal: "labelFontSize + 1" },
    titleColor: { signal: "labelColor" },
  } as VegaAxis;
}

/**
 * The containers of a level that gets labels rather than an axis, each carrying
 * the text that names it.
 *
 * Unlike an axis dataset this one is not aggregated: a `cells` level has each
 * group in a place of its own, and each of those places is named where it is. A
 * container with no rows in it is dropped -- an empty bin in a packed grid is
 * an empty box, and naming it says nothing a reader can use.
 *
 * An `edge` level is the same run of groups repeated across the chart, so only
 * the copy against the edge it is read from is kept. Every container in that
 * copy shares an edge coordinate exactly -- they were laid out along it -- so
 * the run is picked out by that coordinate rather than by counting parents.
 */
function buildLabelData(level: ResolvedAxis): VegaData {
  const bin = level.layout.subgroup.type === "bin";
  const near = level.orient === "top" || level.orient === "left";
  const along = level.orient === "left" || level.orient === "right";
  // The coordinate of the container edge facing the side the labels are on.
  const face = along
    ? near
      ? "datum.absX"
      : "datum.absX + datum.width"
    : near
      ? "datum.absY"
      : "datum.absY + datum.height";
  return {
    name: labelData(level.depth),
    source: levelName(level.depth),
    transform: [
      { type: "filter", expr: "datum.cnt > 0" },
      // The container a `bin` level opens with holds the rows whose value was
      // blank. It has no interval, and the edges it reads back would print it
      // as an empty one, so it goes unnamed rather than misnamed.
      ...(bin
        ? [{ type: "filter" as const, expr: `datum.k${level.depth} >= 0` }]
        : []),
      ...(level.kind === "edge"
        ? ([
            { type: "formula", as: "__face", expr: face },
            {
              type: "joinaggregate",
              fields: ["__face"],
              ops: [near ? "min" : "max"],
              as: ["__outermost"],
            },
            // Within half a pixel, so that a copy laid out a rounding error
            // off the outermost one is still part of it.
            {
              type: "filter",
              expr: "abs(datum.__face - datum.__outermost) <= 0.5",
            },
          ] as Transforms[])
        : []),
      { type: "formula", as: "__text", expr: binOrLabelText(bin, true) },
      // Read by the extent signal, the same way an axis reads its ticks'.
      { type: "formula", as: "len", expr: "length(datum.__text)" },
      // A label stands for its own container, so it can only be drawn where
      // that container has room for it: across, the box has to be as wide as
      // the text; down, as tall as the line.
      {
        type: "formula",
        as: "__fits",
        expr: isHorizontal(level)
          ? `datum.width >= ${GLYPH_WIDTH} * labelFontSize * datum.len ? 1 : 0`
          : "datum.height >= labelFontSize ? 1 : 0",
      },
      { type: "joinaggregate", fields: ["__fits"], ops: ["mean"], as: ["__fitting"] },
      // And a level is labelled only if most of it can be: a guide that reaches
      // a handful of the groups it stands for is worse than no guide, since
      // which ones it reached is a fact about the layout rather than about the
      // data. Whole rows of `titanic_spec3` came out stamped with a number and
      // whole rows came out bare, on nothing but how the packing fell.
      { type: "filter", expr: `datum.__fits && datum.__fitting >= ${LABEL_QUORUM}` },
    ],
  };
}

/**
 * One level's labels: the text naming each of its containers, set against
 * whichever edge of the box that level is read from -- beside a column of
 * groups, over the cells of a packed grid the way a table of small multiples
 * is headed.
 *
 * How far off the box the text sits depends on which of the two it is. An
 * `edge` level's labels are outside the chart, past anything already stacked
 * there, so they take `labels.offset` like an axis does. A `cells` level's are
 * in the strip its own margins leave between one row of boxes and the next, so
 * they take whatever is left of that strip once the line of type is in it --
 * there, `labels.offset` is the most they will take rather than the amount.
 *
 * Whether the text fits its container at all is settled upstream, in
 * `buildLabelData`, by dropping the labels that do not. Vega's own `limit`
 * would truncate them instead, and it measures text against a font it can only
 * measure where there is a canvas to measure with -- so the same chart would
 * ellipsize differently in a browser than out of one.
 */
function buildLabelMark(level: ResolvedAxis): VegaMark {
  const { orient } = level;
  const horizontal = orient === "top" || orient === "bottom";
  // Cell headings start at the left edge of the cell they head, which is what
  // ties them to it: the rule beside them runs from the end of the text to the
  // far edge, so heading and rule together span exactly one cell. An `edge`
  // level is read against the chart rather than against a cell, so its labels
  // stay centered on the container the way an axis tick is.
  const heading = level.kind === "cells" && horizontal;
  const x = !horizontal
    ? orient === "left"
      ? "datum.absX"
      : "datum.absX + datum.width"
    : heading
      ? "datum.absX"
      : "datum.absX + datum.width / 2";
  const y = !horizontal
    ? "datum.absY + datum.height / 2"
    : orient === "top"
      ? "datum.absY"
      : "datum.absY + datum.height";
  const margin: Partial<Padding> = level.layout.margin ?? {};
  const strip = horizontal
    ? (margin.top ?? 0) + (margin.bottom ?? 0)
    : (margin.left ?? 0) + (margin.right ?? 0);
  const gap =
    level.kind === "edge"
      ? ["labelOffset", ...level.inside].join(" + ")
      : horizontal
        ? `min(labelOffset, max(1, ${strip} - labelFontSize))`
        : "labelOffset";
  // Away from the box: up and to the left are the negative directions.
  const away = {
    signal: orient === "top" || orient === "left" ? `-(${gap})` : gap,
  };
  return {
    name: labelMark(level.depth),
    type: "text",
    from: { data: labelData(level.depth) },
    encode: {
      update: {
        x: { scale: "xscale", signal: x },
        y: { scale: "yscale", signal: y },
        // The offset is a pixel nudge rather than a data-space one, so it holds
        // whatever the container is sized in.
        ...(horizontal ? { dy: away } : { dx: away }),
        align: {
          value: heading
            ? "left"
            : horizontal
              ? "center"
              : orient === "left"
                ? "right"
                : "left",
        },
        baseline: {
          value: horizontal ? (orient === "top" ? "bottom" : "top") : "middle",
        },
        text: { field: "__text" },
        fontSize: { signal: "labelFontSize" },
        fill: { signal: "labelColor" },
      },
    },
  } as VegaMark;
}

/**
 * The rule that runs from the end of a cell's heading to the far edge of that
 * cell.
 *
 * A packed level's cells are its facets, and nothing in the chart need show
 * where one ends: the level's own box is styled by the spec, which is free to
 * draw no outline at all, and the gaps between cells are the same gaps the
 * levels inside them leave between their groups. `maxfill_aspect` is both --
 * fifteen bins of `age` drawn as a field of identical little boxes. So the
 * heading says how far its cell reaches, the way an axis's domain line says
 * how far its scale reaches.
 *
 * It starts past the text rather than under it, which is what keeps the two
 * readable as one heading. Where the text ends is estimated from the character
 * count, the same estimate `buildLabelData` drops labels by.
 */
function buildLabelRuleMark(level: ResolvedAxis): VegaMark {
  const top = level.orient === "top";
  const margin: Partial<Padding> = level.layout.margin ?? {};
  const strip = (margin.top ?? 0) + (margin.bottom ?? 0);
  const gap = `min(labelOffset, max(1, ${strip} - labelFontSize))`;
  // The line sits at the middle of the text rather than on its baseline, so it
  // reads as running through the heading rather than underlining it.
  const middle = `${top ? "-" : ""}(${gap}) ${top ? "-" : "+"} 0.35 * labelFontSize`;
  const textEnd = `datum.absX + ${GLYPH_WIDTH} * labelFontSize * datum.len + 4`;
  return {
    name: `${labelMark(level.depth)}Rules`,
    type: "rule",
    from: { data: labelData(level.depth) },
    encode: {
      update: {
        x: { scale: "xscale", signal: textEnd },
        x2: { scale: "xscale", signal: "datum.absX + datum.width" },
        y: { scale: "yscale", signal: `datum.absY${top ? "" : " + datum.height"}` },
        dy: { signal: middle },
        stroke: { signal: "labelColor" },
        strokeWidth: { value: 1 },
        // Lighter than the text: it is the heading's extent, not the heading.
        opacity: { value: 0.35 },
      },
    },
  } as VegaMark;
}

/**
 * The title for a level that got labels rather than an axis -- an axis with
 * everything but its title turned off, so that the field name is placed,
 * rotated and styled exactly as the one over a real axis is.
 *
 * Without it a packed level reads as a grid of numbers nobody named: the cells
 * of `maxfill_aspect` say `21.33-26.67` and never say `age`.
 *
 * A level whose labels were all dropped for want of room has nothing for the
 * title to name, so the title goes with them -- which is decided where they
 * were, in the data, since whether a label fits depends on the chart's size.
 */
function buildLabelTitleAxis(level: ResolvedAxis): VegaAxis {
  const horizontal = isHorizontal(level);
  return {
    scale: horizontal ? "xscale" : "yscale",
    orient: level.orient,
    // Past the labels themselves, which are drawn against the containers and
    // so reach in from this edge by their own extent.
    offset: {
      signal: [
        "labelOffset",
        ...level.inside,
        ...(level.kind === "edge" ? [axisExtent(level.depth)] : []),
      ].join(" + "),
    },
    title: {
      signal: `length(data('${labelData(level.depth)}')) ? ${JSON.stringify(level.title!)} : ''`,
    },
    domain: false,
    ticks: false,
    labels: false,
    titlePadding: AXIS_TITLE_PADDING,
    titleFontSize: { signal: "labelFontSize + 1" },
    titleColor: { signal: "labelColor" },
  } as VegaAxis;
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
  const legend = resolveLegend(spec);
  // The legend names the groups of the field it explains, so the level split
  // on that field needs no annotation of its own.
  const axes = resolveAxes(spec, legend ? spec.mark!.color!.key! : null);
  const decorated = Boolean(axes || legend);

  return {
    width: spec.width,
    height: spec.height,
    // The layout sizes the canvas itself, and the d3 backend draws into exactly
    // that box. Without this vega would re-pad around the mark bounds and shift
    // everything whenever a stroke or a mark spills over the edge.
    //
    // Decorations sit outside that box by construction, so a decorated chart
    // pads instead: the plot area is still exactly `spec.width` by
    // `spec.height`, and the svg around it grows to hold the axes and legend
    // rather than clipping them.
    padding: 0,
    autosize: decorated ? { type: "pad", resize: false } : { type: "none" },
    signals: buildSignals(spec, axes),
    data: buildData(spec, rows, axes),
    // Real axes, and the title-only ones that name the levels drawn as labels.
    ...(axes && axes.levels.some((level) => isAxis(level) || level.title)
      ? {
          axes: axes.levels
            .filter((level) => isAxis(level) || level.title)
            .map((level) => (isAxis(level) ? buildAxis(level) : buildLabelTitleAxis(level))),
        }
      : {}),
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
      // One per shape whose content is a range rather than a literal or the
      // field's own value. Same kind of scale the colors go through, over the
      // same units, so an emoji and a color assign themselves alike.
      ...contentChannels(spec.mark ?? {})
        .filter((channel) => hasRange(spec.mark![channel]!))
        .map((channel) => buildContentScale(channel, spec.mark![channel]!)),
      // One per axis, reading the level that axis was drawn for.
      ...(axes ? axes.levels.filter(isAxis).map(buildAxisScale) : []),
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
      // One per shape the spec said what to draw for. Only the one `markShape`
      // names has any units in it at a time.
      ...contentChannels(spec.mark ?? {}).map(buildContentMark),
      // Last, so a label sits over the units rather than under them. Only the
      // levels that could not be given an axis are drawn here: the text that
      // names each container, and for a heading, the rule showing how far the
      // cell it heads reaches.
      ...(axes
        ? axes.levels
            .filter((level) => level.kind === "cells" && isHorizontal(level))
            .map(buildLabelRuleMark)
        : []),
      ...(axes ? axes.levels.filter(isLabelled).map(buildLabelMark) : []),
    ] as VegaMark[],
  };
}

/**
 * Whether `buildVegaSpec` will emit a spec a bare vega runtime can run.
 *
 * The two weighted packing levels are the parts of the grammar that need a
 * transform vega does not ship: `maxfill` squarifies into a treemap, and
 * `square`/`parent`/`custom` shelve boxes at a scale searched over their own
 * placement -- see `treemap-transform.ts` and `shelf-transform.ts`. Everything
 * else compiles to stock transforms, so the emitted spec can be handed to the
 * Vega Editor, `vega-embed`, or the vega CLI as it stands.
 */
export function isPortable(spec: Spec): boolean {
  return !spec.layouts.some(
    (layout) => isTreemap(layout) || isWeightedPack(layout),
  );
}

/**
 * Mounts the chart in the element with id `divId` and returns the live view.
 *
 * This drives vega's `View` directly rather than going through `vega-embed`.
 * What vega-embed would have added on top is an actions menu and a
 * `vega-tooltip` handler; the tooltip is worth keeping and installed below, and
 * the view it hands back can still render itself to an image
 * (`view.toImageURL`), which is what that menu's useful entry did.
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
    // Vega's stock handler writes the row into the container's `title`
    // attribute; vega-tooltip draws it by the pointer, which is what
    // vega-embed used to install for us.
    tooltip: new TooltipHandler().call,
  });
  await view.runAsync();
  return view;
}
