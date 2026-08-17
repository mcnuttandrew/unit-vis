/**
 * The handful of `d3-array` and `d3-scale` routines the layout engine needs,
 * reimplemented so that the core carries no runtime dependencies at all.
 *
 * These are deliberately faithful ports rather than fresh takes: the layout
 * engine's output is compared against the d3 backend's pixel for pixel, so the
 * edge cases matter. In particular the reductions skip nulls and NaNs the way
 * d3's do, and return `undefined`/`-1` rather than `Infinity` on an empty
 * input, which the callers rely on.
 */

/** `range(stop)` or `range(start, stop)`, in unit steps. */
export function range(start: number, stop?: number): number[] {
  const [from, to] = stop === undefined ? [0, start] : [start, stop];
  const out: number[] = [];
  for (let i = from; i < to; i++) {
    out.push(i);
  }
  return out;
}

/**
 * Sum of the accessor over the items. Falsy coercions -- `0`, `NaN`, `null`,
 * `undefined` -- contribute nothing, so a missing field cannot poison the
 * total, and an empty input sums to 0.
 */
export function sum<T>(items: Iterable<T>, accessor: (item: T) => unknown): number {
  let total = 0;
  for (const item of items) {
    const value = Number(accessor(item));
    if (value) {
      total += value;
    }
  }
  return total;
}

/**
 * Smallest value of the accessor, or `undefined` when nothing comparable was
 * seen. The `value >= value` test is what rejects NaN without a special case.
 */
export function min<T>(items: Iterable<T>, accessor: (item: T) => number): number | undefined {
  let smallest: number | undefined;
  for (const item of items) {
    const value = accessor(item);
    if (value != null && (smallest === undefined ? value >= value : smallest > value)) {
      smallest = value;
    }
  }
  return smallest;
}

/** Largest value of the accessor, or `undefined` when nothing comparable was seen. */
export function max<T>(items: Iterable<T>, accessor: (item: T) => number): number | undefined {
  let largest: number | undefined;
  for (const item of items) {
    const value = accessor(item);
    if (value != null && (largest === undefined ? value >= value : largest < value)) {
      largest = value;
    }
  }
  return largest;
}

/** Index of the smallest value of the accessor, or -1 if there is none. */
export function minIndex<T>(items: Iterable<T>, accessor: (item: T) => number): number {
  let smallest: number | undefined;
  let found = -1;
  let index = -1;
  for (const item of items) {
    index++;
    const value = accessor(item);
    if (value != null && (smallest === undefined ? value >= value : smallest > value)) {
      smallest = value;
      found = index;
    }
  }
  return found;
}

/** Index of the largest value of the accessor, or -1 if there is none. */
export function maxIndex<T>(items: Iterable<T>, accessor: (item: T) => number): number {
  let largest: number | undefined;
  let found = -1;
  let index = -1;
  for (const item of items) {
    index++;
    const value = accessor(item);
    if (value != null && (largest === undefined ? value >= value : largest < value)) {
      largest = value;
      found = index;
    }
  }
  return found;
}

/**
 * `[min, max]` of the accessor, with `undefined` in both slots when nothing
 * comparable was seen. Callers turn that into NaN bin edges rather than
 * guessing at a domain.
 */
export function extent<T>(
  items: Iterable<T>,
  accessor: (item: T) => number,
): [number | undefined, number | undefined] {
  let low: number | undefined;
  let high: number | undefined;
  for (const item of items) {
    const value = accessor(item);
    if (value == null) {
      continue;
    }
    if (low === undefined) {
      if (value >= value) {
        low = value;
        high = value;
      }
    } else {
      if (low > value) {
        low = value;
      }
      if (high! < value) {
        high = value;
      }
    }
  }
  return [low, high];
}

/**
 * Interpolates a two-point linear scale, i.e. `scaleLinear().domain(domain)
 * .range(range)` with no clamping and no nicing.
 *
 * The arithmetic is written the way d3's continuous scale writes it -- a
 * normalize step followed by `a * (1 - t) + b * t` -- because bin edges
 * computed the other algebraically-equivalent way (`a + t * (b - a)`) land on
 * different floating point values, and the bin edges are compared against
 * data values with `<=`.
 */
export function linearScale(domain: [number, number], range: [number, number]): (x: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  return (x: number): number => {
    const t = span ? (x - d0) / span : Number.isNaN(span) ? NaN : 0.5;
    return r0 * (1 - t) + r1 * t;
  };
}

/** The rows that fell in one bin, tagged with the interval they fell into. */
export interface Bin<T> extends Array<T> {
  /** Lower edge of the interval, inclusive. */
  x0?: number;
  /** Upper edge of the interval, exclusive except in the last bin. */
  x1?: number;
}

/** Index of the first threshold greater than `x`, i.e. `d3.bisectRight`. */
function bisectRight(thresholds: number[], x: number, hi: number): number {
  let lo = 0;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (thresholds[mid] <= x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Buckets items into the intervals named by an explicit threshold array, which
 * is the one shape of `d3.bin()` the engine uses: a fixed domain and edges the
 * caller computed itself.
 *
 * The threshold trimming below looks redundant against evenly spaced edges but
 * is not, and it is why a `bin` subgroup produces `numBin + 1` containers
 * rather than `numBin`: the leading edge equals the domain minimum and is
 * dropped, leaving a zero-width final interval that collects the rows sitting
 * exactly on the maximum. Both backends have always drawn that trailing
 * container, so it is preserved deliberately.
 *
 * Values outside the domain -- including NaN, which fails both comparisons --
 * are dropped rather than clamped into an end bin.
 */
export function bin<T>(
  items: T[],
  options: {domain: [number, number]; thresholds: number[]; value: (item: T) => number},
): Bin<T>[] {
  const {domain, value} = options;
  const [x0, x1] = domain;
  const values = items.map(value);

  let thresholds = options.thresholds;
  let count = thresholds.length;
  let first = 0;
  let last = count;
  while (thresholds[first] <= x0) {
    first++;
  }
  while (thresholds[last - 1] > x1) {
    last--;
  }
  if (first || last < count) {
    thresholds = thresholds.slice(first, last);
    count = last - first;
  }

  const bins: Bin<T>[] = [];
  for (let i = 0; i <= count; i++) {
    const b: Bin<T> = [];
    b.x0 = i > 0 ? thresholds[i - 1] : x0;
    b.x1 = i < count ? thresholds[i] : x1;
    bins.push(b);
  }

  for (let i = 0; i < items.length; i++) {
    const x = values[i];
    if (x != null && x0 <= x && x <= x1) {
      bins[bisectRight(thresholds, x, count)].push(items[i]);
    }
  }

  return bins;
}
