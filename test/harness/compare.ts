/**
 * Quality metrics over normalized SVG models.
 *
 * Two flavors of check live here:
 *   - `inspect`: is a single rendering well-formed at all (finite geometry,
 *     inside the canvas, non-degenerate marks, marks not piled on top of each
 *     other)?
 *   - `compare`: does the vega rendering agree with the old one, mark for mark?
 */
import type {Primitive, SvgModel} from './svg-model';

export interface QualityReport {
  markCount: number;
  boxCount: number;
  /** Marks with a non-finite coordinate or size. */
  nonFinite: Primitive[];
  /** Marks with zero or negative extent — invisible ink. */
  degenerate: Primitive[];
  /** Marks whose bounding box leaves the canvas by more than `tolerance`. */
  outOfBounds: Primitive[];
  /** Marks with no fill resolved, usually a broken scale. */
  unfilled: Primitive[];
  /** Distinct fills used by unit marks. */
  fills: string[];
  /** Fraction of unit-mark pairs that overlap, over pairs that are near enough to test. */
  overlapRatio: number;
  /** Union bounding box of all unit marks. */
  extent: {x0: number; y0: number; x1: number; y1: number} | null;
  unclassified: string[];
}

const isFinitePrimitive = (p: Primitive): boolean =>
  [p.x, p.y, p.width, p.height, p.cx, p.cy].every(v => Number.isFinite(v));

export function inspect(model: SvgModel, tolerance = 0.5): QualityReport {
  const units = model.units;
  const finite = units.filter(isFinitePrimitive);
  const extent = finite.length
    ? {
        x0: Math.min(...finite.map(p => p.x)),
        y0: Math.min(...finite.map(p => p.y)),
        x1: Math.max(...finite.map(p => p.x + p.width)),
        y1: Math.max(...finite.map(p => p.y + p.height)),
      }
    : null;

  return {
    markCount: units.length,
    boxCount: model.boxes.length,
    nonFinite: units.filter(p => !isFinitePrimitive(p)),
    degenerate: finite.filter(p => p.width <= 0 || p.height <= 0),
    outOfBounds: finite.filter(
      p =>
        p.x < -tolerance ||
        p.y < -tolerance ||
        p.x + p.width > model.width + tolerance ||
        p.y + p.height > model.height + tolerance,
    ),
    unfilled: finite.filter(p => !p.fill),
    fills: Array.from(new Set(finite.map(p => p.fill).filter(Boolean) as string[])).sort(),
    overlapRatio: overlapRatio(finite),
    extent,
    unclassified: model.unclassified,
  };
}

/**
 * Vega writes path coordinates to three decimals, so marks that are exactly
 * tangent in the old backend come out overlapping by a thousandth of a pixel.
 * Ignore anything below a twentieth of a pixel.
 */
const OVERLAP_EPSILON = 0.05;

/**
 * Unit charts draw one mark per datum in its own cell, so marks should barely
 * overlap. Measured against a grid so a few thousand marks stay cheap.
 */
export function overlapRatio(units: Primitive[]): number {
  if (units.length < 2) {
    return 0;
  }
  const cell = Math.max(1, Math.max(...units.map(u => Math.max(u.width, u.height))));
  const buckets = new Map<string, Primitive[]>();
  const key = (x: number, y: number): string => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  units.forEach(u => {
    const k = key(u.cx, u.cy);
    buckets.set(k, (buckets.get(k) || []).concat(u));
  });

  let tested = 0;
  let overlapping = 0;
  units.forEach(u => {
    const gx = Math.floor(u.cx / cell);
    const gy = Math.floor(u.cy / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        (buckets.get(`${gx + dx}:${gy + dy}`) || []).forEach(other => {
          if (other === u) {
            return;
          }
          tested++;
          const overlapX = Math.min(u.x + u.width, other.x + other.width) - Math.max(u.x, other.x);
          const overlapY = Math.min(u.y + u.height, other.y + other.height) - Math.max(u.y, other.y);
          // A shared edge is not an overlap; require visible area.
          if (overlapX > OVERLAP_EPSILON && overlapY > OVERLAP_EPSILON) {
            overlapping++;
          }
        });
      }
    }
  });
  return tested ? overlapping / tested : 0;
}

/**
 * A mark with no extent paints nothing, whatever its markup says. The old
 * backend expresses that as `<circle r="-16">` (which svg refuses to draw) and
 * vega as a zero-radius arc, so a pair of invisible marks is treated as
 * agreeing on shape and size. How many such marks there are is not swept under
 * the rug: `QualityReport.degenerate` counts them per backend, and
 * `ComparisonReport.invisiblePairs` counts them here.
 */
const isInvisible = (p: Primitive): boolean => !(p.width > 0) || !(p.height > 0);

export interface MarkDiff {
  index: number;
  /** Distance between the two marks' centers, in px. */
  centerDistance: number;
  /** Difference in bounding-box width and height, in px. */
  sizeDelta: {width: number; height: number};
  shapeMatches: boolean;
  fillMatches: boolean;
  left: Primitive;
  right: Primitive;
}

export interface ComparisonReport {
  canvasMatches: boolean;
  canvas: {left: {width: number; height: number}; right: {width: number; height: number}};
  counts: {leftUnits: number; rightUnits: number; leftBoxes: number; rightBoxes: number};
  countsMatch: boolean;
  /** Per-mark diffs, pairing marks by their emission order. */
  pairs: MarkDiff[];
  centerDistance: {mean: number; median: number; max: number; p95: number};
  sizeError: {mean: number; max: number};
  /** Share of paired marks within `positionTolerance` of each other. */
  positionAgreement: number;
  shapeAgreement: number;
  /** Exact fill equality across paired marks. */
  fillAgreement: number;
  /**
   * Whether the two renderings group marks into the same color classes, even if
   * the palettes differ. This isolates "wrong scheme" from "wrong encoding".
   */
  colorPartitionMatches: boolean;
  /** Nearest-neighbor agreement, which ignores mark ordering entirely. */
  unmatchedNearest: number;
  /** Pairs where both backends drew a mark with no extent, i.e. nothing. */
  invisiblePairs: number;
  /** Fill sets on each side, for reporting palette drift. */
  fills: {left: string[]; right: string[]};
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) {
    return 0;
  }
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Are the two mark sets partitioned into color classes the same way? Maps each
 * left fill to the right fill it co-occurs with and checks that the mapping is
 * a consistent bijection.
 */
function colorPartitionMatches(pairs: MarkDiff[]): boolean {
  const forward = new Map<string, string>();
  const backward = new Map<string, string>();
  return pairs.every(({left, right}) => {
    const l = left.fill ?? 'none';
    const r = right.fill ?? 'none';
    if (forward.has(l) && forward.get(l) !== r) {
      return false;
    }
    if (backward.has(r) && backward.get(r) !== l) {
      return false;
    }
    forward.set(l, r);
    backward.set(r, l);
    return true;
  });
}

/**
 * Count left marks with no right mark within `tolerance`, ignoring order. A low
 * `unmatchedNearest` alongside a high `centerDistance` means the two backends
 * draw the same picture but emit marks in a different order.
 */
function unmatchedNearest(left: Primitive[], right: Primitive[], tolerance: number): number {
  if (!right.length) {
    return left.length;
  }
  const cell = Math.max(tolerance, 1);
  const buckets = new Map<string, Primitive[]>();
  right.forEach(p => {
    const k = `${Math.floor(p.cx / cell)}:${Math.floor(p.cy / cell)}`;
    buckets.set(k, (buckets.get(k) || []).concat(p));
  });
  return left.filter(p => {
    const gx = Math.floor(p.cx / cell);
    const gy = Math.floor(p.cy / cell);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const near = buckets.get(`${gx + dx}:${gy + dy}`) || [];
        if (near.some(other => Math.hypot(other.cx - p.cx, other.cy - p.cy) <= tolerance)) {
          return false;
        }
      }
    }
    return true;
  }).length;
}

/**
 * Compare two renderings of the same spec. Marks are paired by emission order:
 * both backends walk the container tree depth-first, so mark *i* on each side
 * should be the same datum.
 */
export function compare(left: SvgModel, right: SvgModel, positionTolerance = 0.5): ComparisonReport {
  const n = Math.min(left.units.length, right.units.length);
  const pairs: MarkDiff[] = [];
  let invisiblePairs = 0;
  for (let index = 0; index < n; index++) {
    const l = left.units[index];
    const r = right.units[index];
    const bothInvisible = isInvisible(l) && isInvisible(r);
    if (bothInvisible) {
      invisiblePairs++;
    }
    pairs.push({
      index,
      centerDistance: Math.hypot(l.cx - r.cx, l.cy - r.cy),
      sizeDelta: bothInvisible ? {width: 0, height: 0} : {width: r.width - l.width, height: r.height - l.height},
      shapeMatches: bothInvisible || l.shape === r.shape,
      fillMatches: l.fill === r.fill,
      left: l,
      right: r,
    });
  }

  const distances = pairs.map(p => p.centerDistance).sort((a, b) => a - b);
  const sizeErrors = pairs.map(p => Math.max(Math.abs(p.sizeDelta.width), Math.abs(p.sizeDelta.height)));
  const share = (predicate: (p: MarkDiff) => boolean): number =>
    pairs.length ? pairs.filter(predicate).length / pairs.length : 0;

  return {
    canvasMatches: left.width === right.width && left.height === right.height,
    canvas: {
      left: {width: left.width, height: left.height},
      right: {width: right.width, height: right.height},
    },
    counts: {
      leftUnits: left.units.length,
      rightUnits: right.units.length,
      leftBoxes: left.boxes.length,
      rightBoxes: right.boxes.length,
    },
    countsMatch: left.units.length === right.units.length,
    pairs,
    centerDistance: {
      mean: distances.reduce((a, b) => a + b, 0) / (distances.length || 1),
      median: quantile(distances, 0.5),
      p95: quantile(distances, 0.95),
      max: distances.length ? distances[distances.length - 1] : 0,
    },
    sizeError: {
      mean: sizeErrors.reduce((a, b) => a + b, 0) / (sizeErrors.length || 1),
      max: sizeErrors.length ? Math.max(...sizeErrors) : 0,
    },
    positionAgreement: share(p => p.centerDistance <= positionTolerance),
    shapeAgreement: share(p => p.shapeMatches),
    fillAgreement: share(p => p.fillMatches),
    colorPartitionMatches: colorPartitionMatches(pairs),
    unmatchedNearest: unmatchedNearest(left.units, right.units, positionTolerance),
    invisiblePairs,
    fills: {
      left: Array.from(new Set(left.units.map(u => u.fill).filter(Boolean) as string[])).sort(),
      right: Array.from(new Set(right.units.map(u => u.fill).filter(Boolean) as string[])).sort(),
    },
  };
}

const round = (value: number): string => (Number.isFinite(value) ? value.toFixed(2) : String(value));
const percent = (value: number): string => `${(value * 100).toFixed(1)}%`;

/** A compact, human-readable summary used in assertion messages and reports. */
export function formatComparison(name: string, report: ComparisonReport): string {
  const worst = [...report.pairs].sort((a, b) => b.centerDistance - a.centerDistance)[0];
  return [
    `${name}`,
    `  canvas       old ${report.canvas.left.width}x${report.canvas.left.height}` +
      ` | vega ${report.canvas.right.width}x${report.canvas.right.height}`,
    `  units        old ${report.counts.leftUnits} | vega ${report.counts.rightUnits}`,
    `  boxes        old ${report.counts.leftBoxes} | vega ${report.counts.rightBoxes}`,
    `  center dist  mean ${round(report.centerDistance.mean)} median ${round(report.centerDistance.median)}` +
      ` p95 ${round(report.centerDistance.p95)} max ${round(report.centerDistance.max)}`,
    `  size error   mean ${round(report.sizeError.mean)} max ${round(report.sizeError.max)}`,
    `  agreement    position ${percent(report.positionAgreement)} shape ${percent(report.shapeAgreement)}` +
      ` fill ${percent(report.fillAgreement)}`,
    `  color classes match: ${report.colorPartitionMatches}` +
      ` (old fills ${report.fills.left.length}, vega fills ${report.fills.right.length})`,
    `  unmatched (nearest-neighbor): ${report.unmatchedNearest}` +
      (report.invisiblePairs ? `, invisible in both: ${report.invisiblePairs}` : ''),
    worst
      ? `  worst pair   #${worst.index} old(${round(worst.left.cx)},${round(worst.left.cy)} r${round(
          worst.left.radius,
        )}) vega(${round(worst.right.cx)},${round(worst.right.cy)} r${round(worst.right.radius)})`
      : '  worst pair   n/a',
  ].join('\n');
}

export function formatQuality(name: string, report: QualityReport): string {
  return [
    `${name}`,
    `  marks ${report.markCount}, boxes ${report.boxCount}`,
    `  nonFinite ${report.nonFinite.length}, degenerate ${report.degenerate.length},` +
      ` outOfBounds ${report.outOfBounds.length}, unfilled ${report.unfilled.length}`,
    `  overlap ratio ${percent(report.overlapRatio)}`,
    `  fills ${report.fills.join(', ') || 'none'}`,
    report.extent
      ? `  extent [${round(report.extent.x0)}, ${round(report.extent.y0)}] -> ` +
        `[${round(report.extent.x1)}, ${round(report.extent.y1)}]`
      : '  extent n/a',
  ].join('\n');
}
