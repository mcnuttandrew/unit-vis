/**
 * The second piece of the layout that is not a dataflow reduction: weighted
 * packing.
 *
 * A weighted `square`, `parent` or `custom` level shelves boxes whose area
 * carries a value, and shelving is a sequence of decisions -- where a box lands
 * depends on how much room every box before it left. The scale the boxes are
 * drawn at is a search over that placement, and a shared level takes the
 * smallest scale any container in its sharing group needed, which is a second
 * pass over the first one's results. Neither is expressible in vega's transform
 * vocabulary, so both run here, through the engine's own implementation.
 *
 * Same trade as `treemap-transform.ts`: a spec with a weighted packing level
 * names a transform vega does not ship, so it runs only where this module has
 * been loaded. `buildVegaSpec` reports as much via `isPortable`.
 */
import {Transform, transforms} from 'vega';
import {weightedPackRects, weightedPackUnit} from '@unit-vis/core';
import type {Direction, WeightedPack} from '@unit-vis/core';

/** The `type` a `data.transform` entry uses to reach this. */
export const SHELF_TRANSFORM = 'unitvisshelf';

/** A field accessor as vega's parser hands it over. */
type Accessor = (tuple: Tuple) => unknown;
type Tuple = {[field: string]: unknown};

interface Params {
  /** The parent container each box is packed into. */
  groupby: Accessor;
  /** The containers one unit is minimized across, or the parent again if unshared. */
  share: Accessor;
  weight: Accessor;
  /** The parent's box: width, height. */
  box: [Accessor, Accessor];
  /** The parent's padding: left, right, top, bottom. */
  pad: [Accessor, Accessor, Accessor, Accessor];
  /** `width / height` of the boxes, which the level decides per parent. */
  ratio: Accessor;
  /** The level's margin, as top, left, bottom, right. */
  margin: number[];
  direction: string;
  as: [string, string, string, string];
  modified(): boolean;
}

function groupTuples(tuples: Tuple[], key: Accessor): Map<unknown, Tuple[]> {
  const groups = new Map<unknown, Tuple[]>();
  for (const tuple of tuples) {
    const id = key(tuple);
    const group = groups.get(id);
    if (group) {
      group.push(tuple);
    } else {
      groups.set(id, [tuple]);
    }
  }
  return groups;
}

/** What `weightedPackUnit`/`weightedPackRects` need, read off one parent's tuples. */
function packFor(group: Tuple[], params: Params): WeightedPack {
  const {weight, box, pad, ratio, margin} = params;
  const [width, height] = box;
  const [left, right, top, bottom] = pad;
  const first = group[0];
  return {
    values: group.map(tuple => Number(weight(tuple))),
    width: Number(width(first)),
    height: Number(height(first)),
    padding: {
      left: Number(left(first)),
      right: Number(right(first)),
      top: Number(top(first)),
      bottom: Number(bottom(first)),
    },
    margin: {top: margin[0], left: margin[1], bottom: margin[2], right: margin[3]},
    ratio: Number(ratio(first)),
    direction: params.direction as Direction,
  };
}

/**
 * Pack every parent, at one scale per sharing group.
 *
 * `applyLayout` decides the scale the same way: each container is packed at the
 * largest scale it can hold, and a shared level then re-packs every container in
 * the group at the smallest of them, so one unit of weight means one area
 * throughout.
 */
function layoutGroups(tuples: Tuple[], params: Params): void {
  const [xOut, yOut, widthOut, heightOut] = params.as;
  const parents = groupTuples(tuples, params.groupby);

  const packs = new Map<unknown, {group: Tuple[]; pack: WeightedPack; unit: number}>();
  const sharedUnit = new Map<unknown, number>();

  for (const [id, group] of parents) {
    const pack = packFor(group, params);
    const unit = weightedPackUnit(pack);
    packs.set(id, {group, pack, unit});

    const share = params.share(group[0]);
    const previous = sharedUnit.get(share);
    sharedUnit.set(share, previous === undefined ? unit : Math.min(previous, unit));
  }

  for (const {group, pack, unit} of packs.values()) {
    const shared = sharedUnit.get(params.share(group[0]));
    const rects = weightedPackRects(pack, shared === undefined ? unit : shared);
    group.forEach((tuple, index) => {
      tuple[xOut] = rects[index].x;
      tuple[yOut] = rects[index].y;
      tuple[widthOut] = rects[index].width;
      tuple[heightOut] = rects[index].height;
    });
  }
}

/**
 * The vega operator. As with the treemap, every tuple is rewritten on any
 * change: the boxes of a pack all depend on one another, and under a shared size
 * so do the packs of a whole sharing group.
 */
class UnitVisShelf extends Transform {
  static Definition = {
    type: 'UnitVisShelf',
    metadata: {modifies: true},
    params: [
      {name: 'groupby', type: 'field', required: true},
      {name: 'share', type: 'field', required: true},
      {name: 'weight', type: 'field', required: true},
      {name: 'box', type: 'field', array: true, length: 2, required: true},
      {name: 'pad', type: 'field', array: true, length: 4, required: true},
      {name: 'ratio', type: 'field', required: true},
      {name: 'margin', type: 'number', array: true, length: 4, required: true},
      {name: 'direction', type: 'string', required: true},
      {name: 'as', type: 'string', array: true, length: 4, default: ['x', 'y', 'width', 'height']},
    ],
  };

  constructor(params?: unknown) {
    super(null, params);
  }

  transform(
    params: Params,
    pulse?: {materialize(flags: unknown): {source: Tuple[]}; SOURCE: unknown; reflow(force: boolean): {modifies(fields: string[]): unknown}},
  ): unknown {
    const flow = pulse!;
    layoutGroups(flow.materialize(flow.SOURCE).source, params);
    return flow.reflow(params.modified()).modifies(params.as);
  }
}

/**
 * Make the transform available to `vega.parse`, once. Called by the compiler
 * when it emits a level that needs it, for the reason given in
 * `treemap-transform.ts`.
 */
export function registerShelfTransform(): void {
  const registry = transforms as {[name: string]: unknown};
  if (!registry[SHELF_TRANSFORM]) {
    registry[SHELF_TRANSFORM] = UnitVisShelf;
  }
}
