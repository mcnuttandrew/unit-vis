/**
 * The one piece of the layout that is not a dataflow reduction.
 *
 * A weighted `maxfill` level squarifies its children into a treemap, and Bruls'
 * algorithm is a sequence of decisions -- a row of boxes is closed off only once
 * adding the next box would make the row's aspect ratio worse, and where the
 * next row starts depends on every choice before it. Nothing in vega's
 * transform vocabulary expresses that, so it is registered as a custom
 * transform running the engine's own implementation, once per parent.
 *
 * Registering it is what lets the rest of the layout stay declarative. The cost
 * is that a spec with a weighted `maxfill` level names a transform vega does not
 * ship, so it runs only where this module has been loaded and is not portable to
 * a bare vega runtime. Every other spec emits stock transforms and stays
 * portable -- `buildVegaSpec` reports which, via `isPortable`.
 */
import {Transform, transforms} from 'vega';
import {treemapMultidimensional} from '@unit-vis/core';

/** The `type` a `data.transform` entry uses to reach this. */
export const TREEMAP_TRANSFORM = 'unitvistreemap';

/** A field accessor as vega's parser hands it over. */
type Accessor = (tuple: Tuple) => unknown;
type Tuple = {[field: string]: unknown};

interface Params {
  groupby: Accessor;
  weight: Accessor;
  box: [Accessor, Accessor];
  as: [string, string, string, string];
  modified(): boolean;
}

/**
 * Lay each parent's children out as a squarified treemap, in parent-relative
 * coordinates.
 *
 * Children whose weight is not positive are dropped before the layout runs and
 * keep the zero-size box they were built with, which is what
 * `calcPackGridxyMaxFillVisualSpaceFunction` leaves them with.
 */
function layoutGroups(tuples: Tuple[], params: Params): void {
  const {groupby, weight, box, as} = params;
  const [xOut, yOut, widthOut, heightOut] = as;

  const groups = new Map<unknown, Tuple[]>();
  for (const tuple of tuples) {
    const key = groupby(tuple);
    const group = groups.get(key);
    if (group) {
      group.push(tuple);
    } else {
      groups.set(key, [tuple]);
    }
  }

  for (const group of groups.values()) {
    for (const tuple of group) {
      tuple[xOut] = 0;
      tuple[yOut] = 0;
      tuple[widthOut] = 0;
      tuple[heightOut] = 0;
    }

    const placed = group.filter(tuple => Number(weight(tuple)) > 0);
    if (!placed.length) {
      continue;
    }
    placed.sort((a, b) => Number(weight(b)) - Number(weight(a)));

    const rects = treemapMultidimensional(
      placed.map(tuple => Number(weight(tuple))),
      Number(box[0](placed[0])),
      Number(box[1](placed[0])),
    );

    placed.forEach((tuple, index) => {
      const rect = rects[index];
      tuple[xOut] = rect[0];
      tuple[yOut] = rect[1];
      tuple[widthOut] = rect[2] - rect[0];
      tuple[heightOut] = rect[3] - rect[1];
    });
  }
}

/**
 * The vega operator. Every tuple in the stream is rewritten on any change,
 * which is correct rather than lazy: a treemap's boxes all depend on one
 * another, so a single tuple moving re-lays out its whole parent anyway.
 */
class UnitVisTreemap extends Transform {
  static Definition = {
    type: 'UnitVisTreemap',
    metadata: {modifies: true},
    params: [
      {name: 'groupby', type: 'field', required: true},
      {name: 'weight', type: 'field', required: true},
      {name: 'box', type: 'field', array: true, length: 2, required: true},
      {name: 'as', type: 'string', array: true, length: 4, default: ['x', 'y', 'width', 'height']},
    ],
  };

  constructor(params?: unknown) {
    super(null, params);
  }

  transform(params: Params, pulse?: {materialize(flags: unknown): {source: Tuple[]}; SOURCE: unknown; reflow(force: boolean): {modifies(fields: string[]): unknown}}): unknown {
    const flow = pulse!;
    layoutGroups(flow.materialize(flow.SOURCE).source, params);
    return flow.reflow(params.modified()).modifies(params.as);
  }
}

/**
 * Make the transform available to `vega.parse`, once.
 *
 * Called by the compiler when it emits a level that needs it rather than run as
 * an import side effect, so that the package can keep saying `sideEffects:
 * false` and a bundler is never in a position to drop the registration.
 */
export function registerTreemapTransform(): void {
  const registry = transforms as {[name: string]: unknown};
  if (!registry[TREEMAP_TRANSFORM]) {
    registry[TREEMAP_TRANSFORM] = UnitVisTreemap;
  }
}
