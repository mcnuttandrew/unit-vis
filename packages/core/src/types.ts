/**
 * Space reserved *inside* a box, in pixels. Content laid out within the box is
 * inset by these amounts on each side.
 *
 * Contrast with a layout's `margin`, which is space reserved *outside* each
 * container it produces.
 */
export interface Padding {
  /** Pixels of inset along the top edge. */
  top: number;
  /** Pixels of inset along the left edge. */
  left: number;
  /** Pixels of inset along the right edge. */
  right: number;
  /** Pixels of inset along the bottom edge. */
  bottom: number;
}

/**
 * How big a unit mark is drawn inside the container the layout gave it.
 *
 * Only `max` is implemented: it inscribes the mark in its container. The other
 * values fall through to a radius of 0, which draws nothing — they are
 * placeholders for size policies the paper describes but this library does not
 * implement yet. Use `max` unless you want the marks hidden.
 */
export type SizePolicies = "uniform" | "count" | "sum" | "max";

/**
 * A categorical color palette, named the way d3-scale-chromatic names them.
 *
 * The vega backend translates these to its own scheme names, so the same value
 * works on both backends.
 *
 * - `schemeCategory10` — 10 colors, the general-purpose default
 * - `schemeTableau10` — 10 colors, Tableau's palette
 * - `schemeAccent`, `schemeDark2`, `schemeSet1`, `schemeSet2`, `schemeSet3` —
 *   8-12 saturated colors, good for marks on a light background
 * - `schemePaired` — 12 colors in light/dark pairs, for nested categories
 * - `schemePastel1`, `schemePastel2` — muted, good for large filled areas
 *
 * @default "schemeCategory10"
 */
export type Schemes =
  | "schemeCategory10"
  | "schemeAccent"
  | "schemeDark2"
  | "schemePaired"
  | "schemePastel1"
  | "schemePastel2"
  | "schemeSet1"
  | "schemeSet2"
  | "schemeSet3"
  | "schemeTableau10";

/**
 * What a mark draws, for the shapes that need to be told: the glyph of an
 * `emoji` mark, the outline of a `path` mark, the string of a `text` mark, the
 * source of an `image` mark.
 *
 * A plain string is that content, the same on every unit. An object reads it
 * off the row instead, and `domain`/`range` make that read a scale — the same
 * pair, with the same meaning, that a vega scale takes:
 *
 * - `{key}` alone draws the field's own value, which is what a `text` mark
 *   usually wants: one row, its own label.
 * - `{key, range}` draws the range instead, handing its entries out to the
 *   field's values in first-seen order and repeating when it runs short.
 * - `{key, domain, range}` pairs the two by position, so a value is drawn with
 *   whatever sits at the same index of `range`:
 *   `{"key": "species", "domain": ["Adelie", "Gentoo"], "range": ["🐧", "🐦"]}`.
 * - `default` covers a value the `domain` does not list. Without one, such a
 *   row draws nothing.
 *
 * Vega backend only.
 */
export type MarkContent =
  | string
  | {
      /** The data field to read. */
      key: string;
      /**
       * The values of `key` that `range` pairs with, in order.
       *
       * Leave it out and the values are taken in the order they first appear,
       * exactly as a vega scale builds its own domain. Only read alongside
       * `range` — there is nothing to pair a domain with otherwise.
       */
      domain?: string[];
      /**
       * What to draw, one entry per entry of `domain`.
       *
       * Shorter than the domain and it repeats, the way an ordinal scale's
       * range does. Leave it out and the field's own value is drawn.
       */
      range?: string[];
      /**
       * Content for a row whose value `domain` does not list. Only meaningful
       * alongside an explicit `domain`: without one every value is inside the
       * domain by construction.
       */
      default?: string;
    };

/**
 * How each data row is drawn once the layouts have decided where it goes.
 *
 * The layouts own position and space; the mark owns shape, size within that
 * space, and color. One mark is drawn per row, in the deepest container that
 * row lands in.
 */
export type Mark = {
  /**
   * Color policy for the unit marks. Marks are colored by looking up
   * `color.key` on each row and running it through an ordinal scale.
   */
  color: {
    /**
     * The data field to color by. Every distinct value of this field gets its
     * own color from `scheme`, in first-seen order.
     *
     * This is also the field `spec.legend` explains, and a legend is only
     * drawn when this is set.
     */
    key: string;
    /**
     * The kind of scale to build over `color.key`. Only `categorical` is
     * implemented — values are treated as discrete regardless of whether they
     * look numeric.
     */
    type: "categorical";
    /**
     * The categorical palette used for `color.key`.
     *
     * @default "schemeCategory10"
     */
    scheme?: Schemes;
    /**
     * Reserved. Read by neither backend today; the color scale is always built
     * across the whole chart.
     */
    isShared?: boolean;
  };

  /**
   * How large the mark is drawn inside its container. Read by every shape but
   * `rect`, which always fills its container exactly.
   */
  size?: {
    /**
     * When true, every circle in the chart is drawn at the radius of the
     * smallest one, so mark area never encodes anything accidentally. When
     * false, each circle is sized against its own container, so marks in
     * roomier containers come out bigger.
     *
     * @default false
     */
    isShared: boolean;
    /**
     * The sizing rule. Use `max`, which inscribes the circle in its container
     * (radius = half the container's shorter side). The other values are
     * unimplemented and render a radius of 0, i.e. invisible marks.
     *
     * @default "max"
     */
    type: SizePolicies;
  };

  /**
   * The shape drawn per row.
   *
   * - `circle` — inscribed in its container, sized by `mark.size`
   * - `rect` — fills its container exactly, ignoring `mark.size`
   *
   * The rest are drawn by the vega backend only, and each is told what to draw
   * by the `mark` field of the same name. Set the shape without setting that
   * field and there is nothing to draw, so the marks fall back to circles.
   * All four sit in the same box a `circle` would take — centered on the
   * container and sized by `mark.size` — so switching between them moves
   * nothing but the shape.
   *
   * - `emoji` — the glyph named by `mark.emoji`, drawn as text one container
   *   across. Keeps the font's own colors rather than taking `mark.color`.
   * - `text` — the string named by `mark.text`, shrunk to fit its container
   *   unless `mark.fontSize` says otherwise.
   * - `path` — the outline named by `mark.path`, an SVG path drawn in the box
   *   from (-1, -1) to (1, 1) and scaled to the container.
   * - `image` — the picture named by `mark.image`, fit inside the container
   *   with its aspect ratio kept.
   *
   * @default "circle"
   */
  shape?: "circle" | "rect" | "emoji" | "text" | "path" | "image";

  /**
   * The glyph a `shape: "emoji"` mark draws — `"🐧"` for the same one
   * everywhere, or `{"key": "species", "range": [...]}` for one per category.
   *
   * Vega backend only.
   */
  emoji?: MarkContent;

  /**
   * The string a `shape: "text"` mark draws. Usually `{"key": "name"}`, i.e.
   * each unit labelled with its own value of a field.
   *
   * Text is set at whatever size keeps it inside its container, which is a
   * per-string, per-container decision — so turn on `mark.size.isShared` to
   * have every string set at one size, the one that fits everywhere.
   *
   * Vega backend only.
   */
  text?: MarkContent;

  /**
   * The outline a `shape: "path"` mark draws, as an SVG path string.
   *
   * The path is read in a square box running from (-1, -1) to (1, 1) with the
   * origin at the mark's center, and scaled so that box is the container's
   * inscribed square. `"M0,-1L1,1L-1,1Z"` is a triangle filling the container.
   * Takes `mark.color` like a circle does.
   *
   * Vega backend only.
   */
  path?: MarkContent;

  /**
   * The picture a `shape: "image"` mark draws, as a url or a data uri. The
   * image is fit inside the container's inscribed square with its aspect ratio
   * kept, so a non-square picture is letterboxed rather than stretched.
   *
   * Vega backend only.
   */
  image?: MarkContent;

  /**
   * Type size in pixels for `emoji` and `text` marks.
   *
   * Left unset, an emoji is drawn one container across and text is shrunk to
   * whatever size keeps the string inside its container. Set it and the marks
   * are drawn at that size whatever their container, which is what makes a
   * chart of text legible at the cost of letting long strings overlap.
   *
   * Vega backend only.
   */
  fontSize?: number;

  /**
   * Reserved. Present in most bundled example specs and in the library
   * defaults, but read by neither backend.
   */
  isColorScaleShared?: boolean;
};

/**
 * An axis per layout level, drawn outside the chart and read off that level's
 * containers: a tick per group, labelled the way the container is — the group
 * value for a `groupby` subgroup, the bin's own lower edge for a `bin` one, so
 * a histogram reads as a number line rather than as a column of ranges. The
 * axis is titled with the field the level splits on.
 *
 * This is how a unit chart gets its axes. The grammar itself has none: what a
 * level divides space along, and where it puts each group, is decided by the
 * data in it, so the axis is derived from the layout after the fact rather than
 * being a scale the layout was drawn against.
 *
 * A level split on the same field the marks are colored by is left out, since
 * `legend` already names those groups — a chart that splits by species and
 * colors by species has said species once, and does not need two guides for
 * it. Turning the legend off, or naming that level in `layouts`, brings its
 * axis back.
 *
 * An axis describes one thing: a run of groups along one direction, each in
 * one place. Their spacing may vary from parent to parent — a mosaic's splits
 * are sized by what is in them, so a tick stands for containers that do not
 * quite line up and sits at their middle — but their order does not. A level
 * that puts its groups anywhere else is named a different way, since it cannot
 * be ticked off an edge:
 *
 * - A level that packs its groups into a grid has each of them somewhere of
 *   its own, so each is named over its own cell, the way a table of small
 *   multiples is headed. The heading carries a rule to the far edge of its
 *   cell, since nothing else in the chart need show where one cell ends: a
 *   level is free to draw no outline, and the gaps between its cells are the
 *   same gaps the levels inside them leave between their own groups.
 * - A level laid out inside an ancestor that already spread its groups the
 *   same way is the same run repeated in every one of that ancestor's cells.
 *   It is named once, on the copy against the edge it runs along.
 *
 * Either way the text sits by the containers rather than outside the chart, so
 * a label needs room in the container it names, and a level is labelled only
 * where most of its containers have that room. Half named and half not says
 * more about how the layout fell than about the data, so such a level is left
 * alone. The field it splits on is named beside the chart, where an axis would
 * title it.
 *
 * Vega backend only. The old (d3) backend ignores it.
 */
export interface Labels {
  /**
   * Which side to read every level from, overriding the side each would take
   * on its own.
   *
   * Left unset — the usual case — each level takes the side it divides space
   * along: a `fillX` level is read along the bottom, a `fillY` level up the
   * left, and a level that packs its groups is headed from the top. Levels
   * read against the same side are stacked outward, the deepest one closest to
   * the chart.
   */
  orient?: "top" | "bottom" | "left" | "right";
  /**
   * Annotate these layout levels, by `layout.name`, instead of the ones picked
   * by default. A layout with no `name` can never be selected this way.
   *
   * Naming levels overrides what the default selection leaves out: levels that
   * do not name their groups, which is a `flatten` level and its row indices —
   * a `groupby` on `id` included, since the engine's own row index makes that
   * the same thing; the level split on the field `legend` already explains,
   * which would name the same groups a second time; and all but the outermost
   * of the levels labelled over the chart, which would otherwise write into
   * each other's margins. It does not override what a level gets — an axis or
   * labels is a fact about how the level laid its groups out, not about how it
   * was picked — nor whether there is room to draw it.
   */
  layouts?: string[];
  /**
   * Gap in pixels between the chart and the axis nearest it. Labels drawn
   * against a container take it as a maximum, since the room they have is
   * whatever their level's `margin` left between one container and the next.
   *
   * @default 4
   */
  offset?: number;
  /**
   * Type size of the tick and label text, in pixels. Axis titles are drawn one
   * pixel larger. It also decides what fits: a label whose container is
   * narrower than its text at this size is not drawn.
   *
   * @default 10
   */
  fontSize?: number;
  /**
   * CSS color for the text, ticks, labels and titles alike.
   *
   * @default "#333333"
   */
  color?: string;
}

/**
 * A color legend for the key the marks are colored by. Swatches are drawn like
 * the marks they stand for: a square for `rect` units and a circle for
 * `circle` ones, the outline itself for `path`, the glyph written beside the
 * label for `emoji`, and for `text` no swatch at all — the label is drawn in
 * the entry's own color, which is what a text unit is. An `image` mark's
 * picture cannot be put in a legend, so its swatch is the square that picture
 * is fit into.
 *
 * A swatch stands for a whole color group, so it can only show content that
 * group has one of: a literal, or a `mark.emoji`/`text`/`path` keyed by the
 * same field the legend explains. Keyed by anything else the content varies
 * within the group, and the swatches fall back to plain circles.
 *
 * Requires `mark.color.key` — with nothing to explain, no legend is drawn.
 *
 * Vega backend only. The old (d3) backend ignores it.
 */
export interface Legend {
  /**
   * Where the legend sits relative to the plotting area. The corner values
   * place it inside the chart; the side values place it outside, growing the
   * rendered svg rather than shrinking the chart.
   *
   * @default "right"
   */
  orient?:
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  /**
   * Heading above the swatches.
   *
   * @default the value of `mark.color.key`
   */
  title?: string;
}

/**
 * A specification of the unit vis grammar.
 *
 * A unit chart is built by repeated subdivision. The whole canvas starts as one
 * container holding every data row. Each entry in `layouts` takes every
 * container from the previous level, splits its rows into subgroups, and gives
 * each subgroup a box of its own — so `layouts` reads outside-in, from the
 * coarsest split down to the individual rows. The last level is normally a
 * `flatten`, which gives each row its own box; `mark` then decides what gets
 * drawn in it.
 *
 * A stacked bar chart, a mosaic plot, a histogram of dots and a treemap are all
 * this same pipeline with different splits and different space policies.
 */
export interface Spec {
  /**
   * A name for the chart. Carried through the spec but not currently rendered
   * by either backend.
   */
  title?: string;

  /**
   * Where the rows come from. Supply exactly one of `url` or `values`; if both
   * are present `url` wins.
   *
   * Every row is given an `id` field (its index) before layout, so `id` is
   * always available as a grouping key even when the source data has no
   * identifier of its own.
   */
  data: {
    /**
     * Path or URL to the data. A `.json` extension is fetched as a JSON array
     * of row objects; anything else is fetched as CSV.
     *
     * CSV fields arrive as strings while JSON fields keep their written types.
     * The layout engine coerces with `Number` wherever it needs a number, so
     * either source works for binning and summing.
     */
    url?: string; //url
    /**
     * Inline rows, as an array of flat objects. Use instead of `url` when the
     * data is small enough to live in the spec.
     */
    values?: DataRow[];
  };

  /**
   * The subdivision pipeline, applied in order, outermost split first.
   *
   * Level `n` runs over every container produced by level `n - 1`. Most charts
   * end with a `flatten` level so that the final containers hold one row each
   * and the marks have somewhere to sit.
   */
  layouts: Layout[];

  /**
   * How each row is drawn: shape, size, and color.
   *
   * @default {"shape": "circle", "size": {"type": "max", "isShared": false}}
   */
  mark?: Mark;

  /**
   * Name the groups of each layout level that has any, reading them off the
   * containers that level produced — as an axis where the level's shape allows
   * one, and as labels on the containers where it does not. A level split on
   * the field `legend` explains is left to the legend. Pass `true` to take the
   * defaults, or an object to choose the levels, the side, and the type
   * styling.
   *
   * Drawn by the vega backend only; the old backend ignores it.
   *
   * @default false
   */
  labels?: boolean | Labels;

  /**
   * Draw a legend for `mark.color.key`. Pass `true` to take the defaults, or
   * an object to set placement and title. Ignored when `mark.color.key` is
   * unset, since there would be nothing to explain.
   *
   * Drawn by the vega backend only; the old backend ignores it.
   *
   * @default false
   */
  legend?: boolean | Legend;

  /**
   * Height of the drawing surface in pixels. Decorations (`labels`, `legend`)
   * are drawn outside this box, so the rendered svg may be taller.
   *
   * @default 480
   */
  height?: number;
  /**
   * Width of the drawing surface in pixels. Decorations (`labels`, `legend`)
   * are drawn outside this box, so the rendered svg may be wider.
   *
   * @default 720
   */
  width?: number;
  /**
   * Inset between the edge of the canvas and the first layout's containers.
   * This is the chart's outer gutter. The axes `labels` draws sit outside it,
   * in space added around the canvas rather than taken out of it.
   *
   * @default {"top": 0, "left": 0, "bottom": 0, "right": 0}
   */
  padding?: Padding;
  /**
   * URL of the schema this spec is written against. Editors use it for
   * completion and validation; the library ignores it.
   */
  // TODO this should be the version control knob
  $schema?: string;
}

/**
 * The order in which a layout fills the space it was given.
 *
 * Two-letter forms name a single axis and are for `fillX`/`fillY` layouts:
 * `LR` left-to-right, `RL` right-to-left, `TB` top-to-bottom, `BT`
 * bottom-to-top. `fillX` reads the horizontal sense, `fillY` the vertical one.
 *
 * Four-letter forms name a fill axis and then a wrap axis, and are for packing
 * layouts (`square`, `parent`, `maxfill`). `LRTB` runs units left-to-right
 * along a row and stacks rows top-to-bottom; `BTLR` runs them bottom-to-top up
 * a column and advances columns left-to-right. A four-letter form also works
 * for a fill layout, which just reads whichever axis it needs.
 *
 * All eight four-letter orders are implemented, for grid packing and for
 * weighted packing alike.
 *
 * @default "LRBT"
 */
export type Direction =
  | "BT"
  | "BTLR"
  | "BTRL"
  | "LR"
  | "LRBT"
  | "LRTB"
  | "RL"
  | "RLBT"
  | "RLTB"
  | "TB"
  | "TBLR"
  | "TBRL";

/**
 * Where a run of containers sits within the leftover space of its parent, for
 * `fillX` and `fillY` layouts. Packing layouts ignore it.
 *
 * The two-letter codes set both axes at once — horizontal `L`/`C`/`R` then
 * vertical `T`/`M`/`B` — so a single value like `LB` (left, bottom) reads
 * correctly whether the level fills X or Y. The word forms set one axis:
 * `left`/`center`/`right` are read by `fillX`, `top`/`middle`/`bottom` by
 * `fillY`.
 *
 * @default "LB"
 */
export type Align =
  | "bottom"
  | "center"
  | "middle"
  | "right"
  | "top"
  | "CB"
  | "CM"
  | "CT"
  | "LB"
  | "LM"
  | "LT"
  | "RB"
  | "RM"
  | "RT"
  | "left";

/**
 * The union of every value accepted by `Layout.type` and `Layout.subgroup.type`
 * — the two fields take disjoint halves of it.
 *
 * `Layout.type` takes only `gridxy`. `Layout.subgroup.type` takes `groupby`,
 * `bin`, `flatten` or `passthrough`. See those fields for what each does.
 */
export type layoutTypes =
  | "flatten"
  | "groupby"
  | "bin"
  | "passthrough"
  | "gridxy";

/**
 * How a layout turns its parent's space into boxes for its children — the
 * choice that separates a bar chart from a treemap.
 *
 * - `fillX` — lay the children out in a row, each spanning the parent's full
 *   height and taking a share of its width. Widths come from `size`, order
 *   from `direction`, placement from `align`. This is the bar-chart /
 *   column-of-groups case.
 * - `fillY` — the same, transposed: a column of children, each spanning the
 *   full width, sharing the height.
 * - `maxfill` — pack the children into a grid chosen to make the boxes as
 *   large as possible. With a `uniform` size that is a plain grid; with a
 *   `sum`/`count` size it becomes a squarified treemap (see `Layout.size`).
 *   The usual choice for a final `flatten` level.
 * - `square` — pack into square boxes.
 * - `parent` — pack into boxes with the parent's own aspect ratio.
 * - `custom` — pack into boxes of the ratio `custom_aspect_ratio` gives.
 *
 * The last three lay out a grid of equal boxes under a `uniform` size, and a
 * shelf packing of boxes whose *area* carries the value under a `sum`/`count`
 * one — big box, big value, with the level's aspect ratio kept and some space
 * left at the end of each shelf. `maxfill`'s treemap is the other trade: no
 * wasted space, no fixed aspect ratio.
 *
 * @default "maxfill"
 */
export type aspectRatio =
  | "square"
  | "parent"
  | "fillX"
  | "fillY"
  | "maxfill"
  | "custom";

/**
 * One level of subdivision.
 *
 * A layout does two things to every container handed to it: `subgroup` decides
 * how that container's rows are split into children, and `aspect_ratio` /
 * `size` / `direction` / `align` decide how the container's space is divided
 * among them. `padding`, `margin` and `box` then handle spacing and styling.
 */
export interface Layout {
  /**
   * How each container's rows are split into child containers — the data half
   * of the level.
   */
  subgroup: {
    /**
     * The split rule.
     *
     * - `groupby` — one child per distinct value of `key`. The usual
     *   categorical split.
     * - `bin` — one child per interval of the numeric field `key`, cut into
     *   `numBin` equal-width bins over the data's extent. Rows with an empty
     *   value collect in a leading bin labelled `-`. Makes histograms.
     * - `flatten` — one child per row. Normally the last level, so that each
     *   row gets a box for its mark. Honors `sort`.
     * - `passthrough` — one child holding all the rows, unchanged. Used to
     *   insert an extra level of space policy (a nested `fillY` inside a
     *   `fillX`, say) without splitting the data further.
     */
    type: layoutTypes;
    /**
     * The data field to split on. Required by `groupby` and `bin`; ignored by
     * `flatten` and `passthrough`.
     */
    key?: string;
    /**
     * Number of equal-width bins for a `bin` subgroup. Ignored otherwise.
     */
    numBin?: number;
    /**
     * Reserved. Not read by the layout engine — the aspect ratio of a level is
     * set by `Layout.aspect_ratio`, one level up from here.
     */
    aspect_ratio?: number;
    /**
     * Share the set of subgroups across sibling containers instead of deriving
     * it from each container's own rows.
     *
     * With `groupby`, every container gets the same categories in the same
     * order, including empty ones — which is what keeps small multiples
     * aligned and comparable. With `bin`, the bin edges are computed over the
     * shared extent, so bins line up across containers.
     *
     * Leave false and each container gets only the groups its own rows
     * contain, so sibling containers can end up with different, misaligned
     * subgroups.
     *
     * @default false
     */
    isShared?: boolean;
  };

  /**
   * How this level divides space among the children `subgroup` produced.
   *
   * @default "maxfill"
   */
  aspect_ratio?: aspectRatio;

  /**
   * The `width / height` this level draws its boxes at, for
   * `aspect_ratio: "custom"`. `1` is a square, `2` twice as wide as it is tall.
   *
   * Required by `custom` and ignored by every other aspect ratio — a `custom`
   * level without it is an error rather than a chart of unsized boxes.
   */
  custom_aspect_ratio?: number;

  /**
   * Internal. The previous layout in the pipeline, linked up by the engine at
   * render time. Do not set it in a spec.
   */
  parent?: string | Layout;

  /**
   * Internal. The next layout in the pipeline, linked up by the engine at
   * render time. Do not set it in a spec.
   */
  child?: string | Layout;

  /**
   * How much of the parent's space each child claims — the quantitative half of
   * the level, and what makes a bar proportional to anything.
   */
  size?: {
    /**
     * Compute one unit length across every container at this level rather than
     * per parent container.
     *
     * Shared is what makes lengths comparable across the chart: two bars in
     * different groups mean the same thing only if one row is worth the same
     * number of pixels in both. Unshared lets each parent container use its
     * full space, so each group is scaled to its own total.
     *
     * @default true
     */
    isShared?: boolean;
    /**
     * What each child's share is proportional to.
     *
     * - `uniform` — equal shares, regardless of how many rows a child holds
     * - `count` — the number of rows in the child
     * - `sum` — the sum of `key` over the child's rows
     *
     * A `fillX`/`fillY` level turns the share into a length, so this is what
     * makes a bar proportional. A packing level turns it into an area:
     * `maxfill` squarifies the children into a treemap, and `square`, `parent`
     * and `custom` shelf-pack boxes of that area at their own aspect ratio.
     *
     * @default "uniform"
     */
    type?: "uniform" | "sum" | "count";
    /**
     * The numeric field summed by `type: "sum"`. Ignored by the other size
     * types.
     */
    key?: string;
  };

  /**
   * An identifier for this level. Used by `spec.labels.layouts` to pick the
   * levels that get an axis, and by the d3 backend as the css class on the
   * level's `<g>` elements. Otherwise for your own readability.
   */
  name?: string;

  /**
   * Styling for the rectangle drawn behind each container at this level. These
   * are the mosaic tiles, the bar bodies, the small-multiple panels — the boxes
   * the marks sit in.
   *
   * Note that a `flatten` level's box is overwritten with the library default
   * (white fill, gray stroke, zero stroke width, 0.5 opacity), since its boxes
   * are one per row and are normally covered by the mark anyway.
   */
  box?: {
    /**
     * Fill opacity, 0 to 1.
     *
     * @default 0.5
     */
    opacity?: number;
    /**
     * CSS fill color, or `"none"` for an unfilled box.
     *
     * @default "white"
     */
    fill?: string;
    /**
     * CSS stroke color for the box outline.
     *
     * @default "gray"
     */
    stroke?: string;
    /**
     * Outline width in pixels. Set to 0 to hide the outline while keeping the
     * fill.
     *
     * @default 1
     */
    "stroke-width"?: string | number;
  };

  /**
   * The layout algorithm. Only `gridxy` is implemented — it covers every
   * `aspect_ratio` above. Any other value leaves this level's containers
   * unsized.
   *
   * @default "gridxy"
   */
  type?: layoutTypes;

  /**
   * Internal. Scratch space the engine uses while resolving
   * `size.isShared`. Do not set it in a spec.
   */
  sizeSharingGroup?: Container[];

  /**
   * Inset applied inside each container this level produces, i.e. the gutter
   * the *next* level lays out within. Use this to keep nested containers from
   * touching their parent's edge.
   *
   * When a spec has more than one layout, the first level's padding is
   * overwritten with 5 on every side.
   *
   * @default {"top": 0, "left": 0, "bottom": 0, "right": 0}
   */
  padding?: Padding;

  /**
   * Gap around each container this level produces, taken out of the space
   * being divided — so it separates siblings from each other rather than
   * insetting their contents. This is the gap between bars, between mosaic
   * tiles, between small-multiple panels.
   *
   * When a spec has more than one layout, the first level's margin is
   * overwritten with 5 on every side, and any `flatten` level's margin is
   * overwritten with 0.
   *
   * @default {"top": 0, "left": 0, "bottom": 0, "right": 0}
   */
  margin?: Padding;

  /**
   * The order in which children are placed into the space this level divides.
   *
   * @default "LRBT"
   */
  direction?: Direction;

  /**
   * Where the run of children sits within the space left over after sizing.
   * Read by `fillX`/`fillY` levels; ignored when packing.
   *
   * @default "LB"
   */
  align?: Align;

  /**
   * Internal. The containers this level produced, recorded by the engine at
   * render time. Do not set it in a spec.
   */
  containers?: Container[];

  /**
   * Ordering of the children within a container. Read only by `flatten`
   * subgroups — on other subgroup types the order comes from the data
   * (`groupby`, first-seen) or from the bin edges (`bin`).
   *
   * The engine fills in a default sort on every layout that omits one, using
   * the key `survived` — a legacy default from the Titanic examples. On a
   * `flatten` level over data without that field, the ordering is arbitrary
   * but stable, so set `sort` explicitly if the order matters.
   */
  sort?: {
    /** The data field to order by. */
    key: string;
    /**
     * How to compare values of `key`: `numerical` coerces with `Number` before
     * comparing, anything else compares them as they are.
     */
    // TODO i'm unsure this does anything
    type?: "numerical" | "categorical";
    /**
     * Sort order. Any value other than `ascending` is treated as descending.
     *
     * @default "ascending"
     */
    // Todo what is the default ehre
    direction?: "ascending" | "descending";
  };
}

/**
 * A single field value on a data row. CSV sources produce only strings; JSON
 * sources keep whatever scalar they were written with.
 */
export type DataValue = string | number | boolean | null;

/**
 * One row of the input data: a flat object of field name to value. Fields
 * loaded from CSV arrive as strings.
 */
export interface DataRow {
  [x: string]: DataValue;
}

/**
 * Internal. The box the layout engine assigned to a container. Positions are
 * relative to the parent container, not the canvas.
 */
export type VisualSpace = {
  /** Box width in pixels. */
  width: number;
  /** Box height in pixels. */
  height: number;
  /** Offset from the parent container's left edge, in pixels. */
  posX: number;
  /** Offset from the parent container's top edge, in pixels. */
  posY: number;
  /** Inset for whatever is laid out inside this box, from `layout.padding`. */
  padding: Padding;
};

/**
 * Internal. What sits inside a container's `contents`. Every level but the
 * deepest holds further containers; the deepest holds the data rows themselves.
 * Which one it is depends on how far down the tree the node sits, so callers
 * narrow with `isContainer` rather than reading a discriminant.
 */
export type ContainerChild = Container | DataRow;

/**
 * Internal. A node of the tree the layout engine builds, one level per entry in
 * `spec.layouts`. Produced by the engine and consumed by the drawing backends;
 * not part of the authoring grammar.
 */
export interface Container {
  /** Child containers, or — at the deepest level — the data rows themselves. */
  contents: ContainerChild[];
  /**
   * The group this container holds: the `groupby` value, the `low-high` range
   * of a `bin`, the row index under a `flatten`, or `root` for the canvas.
   * This is what the axes `spec.labels` draws read their ticks off.
   */
  label: "root" | string | number;
  /** The box assigned to this container. */
  visualspace: VisualSpace;
  /** The layout level that produced this container. */
  layout: string | Layout | null;
  /** The container this one was split out of. */
  parent: string | Layout | Container | null;
  /** Lower bin edge, on containers produced by a `bin` subgroup. */
  x0?: number;
  /** Upper bin edge, on containers produced by a `bin` subgroup. */
  x1?: number;
}

/**
 * Internal. The grid a packing layout resolved to: how long a unit is along
 * each axis and how many fit. The "filling" edge is the one traversed first,
 * the "remaining" edge the one wrapped onto.
 */
export interface EdgeInfo {
  /** Unit length along the wrap axis, in pixels. */
  remainingEdgeSideUnitLength: number;
  /** Unit length along the fill axis, in pixels. */
  fillingEdgeSideUnitLength: number;
  /** How many units fit along the wrap axis. */
  remainingEdgeRepetitionCount: number;
  /** How many units fit along the fill axis. */
  fillingEdgeRepetitionCount: number;
}
