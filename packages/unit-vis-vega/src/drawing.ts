import { View, parse } from "vega";
import type {
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
  Legend,
  Mark,
  MarkContent,
  Spec,
} from "@unit-vis/core";
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
  labels: ResolvedLabels | null,
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

function buildSignals(spec: Spec, labels: ResolvedLabels | null): VegaSignal[] {
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
      // One per shape whose content is a range rather than a literal or the
      // field's own value. Same kind of scale the colors go through, over the
      // same units, so an emoji and a color assign themselves alike.
      ...contentChannels(spec.mark ?? {})
        .filter((channel) => hasRange(spec.mark![channel]!))
        .map((channel) => buildContentScale(channel, spec.mark![channel]!)),
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
