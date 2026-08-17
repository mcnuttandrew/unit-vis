/**
 * Weighted packing: boxes whose *area* is proportional to a data value, laid out
 * so that none of them overlap.
 *
 * This is the second of the two arms of `⟨Layout⟩` that are not a grid. A
 * weighted `maxfill` level squarifies its children into a treemap, which fills
 * the parent completely at the cost of every box's aspect ratio; a weighted
 * `square`, `parent` or `custom` level keeps the aspect ratio the level asked
 * for and gives up filling the parent completely instead. That is what the
 * paper's "Pack, Size: Sum" cells (Fig. 4's bottom row, Figs. 9-10) are.
 *
 * The algorithm is shelf packing, largest box first: boxes run along the fill
 * axis until the next one would not fit, then a new shelf opens against the
 * tallest box of the one before it. It wastes some space at the end of every
 * shelf, so the boxes are scaled down together until the whole pack fits inside
 * the parent -- `weightedPackUnit` is that scale, expressed as the area one unit
 * of weight is worth, which is the same currency the fill layouts' unit length
 * is in and so shares across a level the same way.
 *
 * Both backends pack through this module, so the vega dataflow and the JS engine
 * cannot drift: `unit-vis-vega` wraps it in a custom transform the way it wraps
 * the treemap.
 */
import type {Direction, Padding} from './types.js';

/** A box in parent-relative coordinates. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Everything a weighted pack needs to know about one parent container. */
export interface WeightedPack {
  /** One weight per child, in container order. Non-positive weights get no box. */
  values: number[];
  /** The parent's box. */
  width: number;
  height: number;
  /** The parent's padding. The boxes are packed inside it. */
  padding: Padding;
  /** The level's margin: space kept clear around each box. */
  margin: Padding;
  /** `width / height` of every box this pack produces. */
  ratio: number;
  /** Which way the shelves run, and which way they stack. */
  direction: Direction;
}

/**
 * How the shelves are oriented, read off the direction's two halves: the first
 * pair names the axis boxes run along and its sense, the second the axis the
 * shelves stack along.
 */
interface Orientation {
  /** Boxes run along y and shelves stack along x, rather than the other way round. */
  transposed: boolean;
  /** The fill axis runs right-to-left, or bottom-to-top. */
  fillBackward: boolean;
  /** The same for the stacking axis. */
  wrapBackward: boolean;
}

/**
 * Bisection steps for the scale search. Each one halves the interval, so this is
 * far below the precision at which two boxes could be told apart on a canvas,
 * and the whole search is still linear in the number of boxes.
 */
const SCALE_STEPS = 60;

/** Slack for the "does this shelf still have room" test, in pixels. */
const EPSILON = 1e-9;

function orientationOf(direction: Direction): Orientation {
  // The two-letter forms name one axis and belong to the fill layouts; a
  // packing level should never see one, but completing it with the usual
  // stacking axis is better than leaving the pack unoriented.
  const full =
    direction.length === 4
      ? direction
      : direction === 'LR' || direction === 'RL'
        ? `${direction}TB`
        : `${direction}LR`;
  const fill = full.slice(0, 2);
  const wrap = full.slice(2);
  return {
    transposed: fill === 'TB' || fill === 'BT',
    fillBackward: fill === 'RL' || fill === 'BT',
    wrapBackward: wrap === 'RL' || wrap === 'BT',
  };
}

/** The parent's space with its padding taken off. */
function innerBox(pack: WeightedPack): {width: number; height: number} {
  return {
    width: pack.width - pack.padding.left - pack.padding.right,
    height: pack.height - pack.padding.top - pack.padding.bottom,
  };
}

/** The box a weight is worth, at a given area per unit of weight. */
function boxFor(value: number, unit: number, ratio: number): {width: number; height: number} {
  const area = unit * value;
  return {width: Math.sqrt(area * ratio), height: Math.sqrt(area / ratio)};
}

/**
 * The order boxes are placed in: largest weight first, ties in container order.
 *
 * Placing them in descending order is what makes the pack's extent grow
 * monotonically with the scale -- every shelf is opened by its own tallest box
 * -- and so what lets `weightedPackUnit` bisect for the largest scale that fits.
 */
function placementOrder(values: number[]): number[] {
  return values
    .map((_value, index) => index)
    .filter(index => values[index] > 0)
    .sort((a, b) => values[b] - values[a] || a - b);
}

/**
 * Place the boxes at a given scale and report where they landed, in the
 * parent-relative frame, along with how much of the parent the pack used.
 *
 * Positions are computed along the fill and wrap axes and mapped onto x and y at
 * the end, so one placement loop serves all eight directions. A backward axis is
 * measured from the far edge of the parent's inner box rather than from the pack
 * itself, which is what anchors a bottom-to-top pack to the bottom.
 */
function place(
  pack: WeightedPack,
  unit: number,
  order: number[],
): {rects: Rect[]; usedFill: number; usedWrap: number} {
  const {values, margin, ratio, padding} = pack;
  const {transposed, fillBackward, wrapBackward} = orientationOf(pack.direction);
  const inner = innerBox(pack);
  const innerFill = transposed ? inner.height : inner.width;
  const innerWrap = transposed ? inner.width : inner.height;
  const marginFill = transposed ? margin.top + margin.bottom : margin.left + margin.right;
  const marginWrap = transposed ? margin.left + margin.right : margin.top + margin.bottom;

  const rects: Rect[] = values.map(() => ({x: 0, y: 0, width: 0, height: 0}));

  let fillCursor = 0;
  let wrapCursor = 0;
  let shelfWrap = 0;
  let usedFill = 0;

  for (const index of order) {
    const box = boxFor(values[index], unit, ratio);
    const slotFill = (transposed ? box.height : box.width) + marginFill;
    const slotWrap = (transposed ? box.width : box.height) + marginWrap;

    // A box wider than the whole shelf still opens one of its own rather than
    // looping forever; the overflow is what tells the scale search to back off.
    if (fillCursor > 0 && fillCursor + slotFill > innerFill + EPSILON) {
      wrapCursor += shelfWrap;
      shelfWrap = 0;
      fillCursor = 0;
    }

    const fillPos = fillBackward ? innerFill - fillCursor - slotFill : fillCursor;
    const wrapPos = wrapBackward ? innerWrap - wrapCursor - slotWrap : wrapCursor;
    const x = transposed ? wrapPos : fillPos;
    const y = transposed ? fillPos : wrapPos;

    rects[index] = {
      x: padding.left + x + margin.left,
      y: padding.top + y + margin.top,
      width: box.width,
      height: box.height,
    };

    fillCursor += slotFill;
    shelfWrap = Math.max(shelfWrap, slotWrap);
    usedFill = Math.max(usedFill, fillCursor);
  }

  return {rects, usedFill, usedWrap: wrapCursor + shelfWrap};
}

/**
 * The largest area-per-unit-of-weight whose pack still fits inside the parent.
 *
 * The upper bound is the scale at which the boxes would exactly tile the
 * parent's inner box, which only a pack that wastes nothing could reach; from
 * there the answer is bisected. Returns 0 when there is nothing to place or no
 * space to place it in.
 */
export function weightedPackUnit(pack: WeightedPack): number {
  const order = placementOrder(pack.values);
  const inner = innerBox(pack);
  if (!order.length || !(inner.width > 0) || !(inner.height > 0)) {
    return 0;
  }

  const total = order.reduce((sum, index) => sum + pack.values[index], 0);
  const ceiling = (inner.width * inner.height) / total;
  if (!Number.isFinite(ceiling) || !(pack.ratio > 0) || !Number.isFinite(pack.ratio)) {
    return 0;
  }

  const {transposed} = orientationOf(pack.direction);
  const innerFill = transposed ? inner.height : inner.width;
  const innerWrap = transposed ? inner.width : inner.height;
  const fits = (unit: number): boolean => {
    const {usedFill, usedWrap} = place(pack, unit, order);
    return usedFill <= innerFill + EPSILON && usedWrap <= innerWrap + EPSILON;
  };

  if (fits(ceiling)) {
    return ceiling;
  }

  let low = 0;
  let high = ceiling;
  for (let step = 0; step < SCALE_STEPS; step++) {
    const mid = (low + high) / 2;
    if (fits(mid)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * The boxes themselves, in container order, at a scale already decided.
 *
 * A child with no weight keeps a zero box, which is what the treemap arm leaves
 * such a child with too.
 */
export function weightedPackRects(pack: WeightedPack, unit: number): Rect[] {
  return place(pack, unit, placementOrder(pack.values)).rects;
}
