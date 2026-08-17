/**
 * `mark.size`: how big a unit mark is drawn, and what that size says.
 *
 * Three of the four policies used to draw a radius of nothing, so the checks
 * here are mostly about what a mark's area now means. Two claims run through
 * all of them. That the area is the value -- a mark standing for twice as much
 * is drawn at twice the area, not twice the radius. And that a mark never
 * outgrows the box the layout gave it, whatever the group it was sized
 * against.
 *
 * Both backends are held to the same numbers throughout: the policies are part
 * of the grammar rather than of either renderer, and the vega backend computes
 * them in a dataflow while the d3 one computes them in JS, so agreement here is
 * worth something.
 */
import {beforeAll, describe, expect, it} from 'vitest';
import {buildVegaSpec} from 'unit-vis-vega';
import type {DataRow, Mark, SizePolicies, Spec} from '@unit-vis/core';
import {buildSceneForSpec, renderOld, renderVegaHeadless} from './harness/render';
import {modelFromOldSvg, modelFromVegaSvg, type Primitive} from './harness/svg-model';

const WIDTH = 400;
const HEIGHT = 200;

/**
 * Two columns, split differently inside: the left one 1 row against 3, the
 * right one 5 against 5. So the four containers the marks are drawn in are of
 * four different sizes, which is what tells a policy sized against the whole
 * chart apart from one sized against a parent -- and the counts are 1, 3, 5, 5,
 * which are the values the data policies read.
 */
const ROWS: DataRow[] = [
  ...Array.from({length: 1}, (_, i) => ({side: 'L', part: 'p', weight: 2, id: `Lp${i}`})),
  ...Array.from({length: 3}, (_, i) => ({side: 'L', part: 'q', weight: 2, id: `Lq${i}`})),
  ...Array.from({length: 5}, (_, i) => ({side: 'R', part: 'p', weight: 2, id: `Rp${i}`})),
  ...Array.from({length: 5}, (_, i) => ({side: 'R', part: 'q', weight: 2, id: `Rq${i}`})),
];

/** Rows per container, in the order `containers()` returns them. */
const COUNTS = {Lp: 1, Lq: 3, Rp: 5, Rq: 5};

/**
 * A chart whose deepest level groups rather than flattens, so there is one mark
 * per group and a data policy has something to say. `size` is the mark policy
 * under test; everything else is held still.
 */
function specWith(size: {type: SizePolicies; isShared: boolean; key?: string}): Spec {
  return {
    data: {values: ROWS},
    width: WIDTH,
    height: HEIGHT,
    layouts: [
      {
        name: 'side',
        subgroup: {type: 'groupby', key: 'side', isShared: false},
        aspect_ratio: 'fillX',
        size: {type: 'uniform', isShared: true},
        direction: 'LRBT',
        align: 'LB',
      },
      {
        name: 'part',
        subgroup: {type: 'groupby', key: 'part', isShared: true},
        aspect_ratio: 'fillY',
        size: {type: 'count', isShared: false},
        direction: 'TB',
        align: 'LT',
      },
    ],
    mark: {shape: 'circle', color: {key: 'part', type: 'categorical'}, size} as Mark,
  };
}

/** The radii of one chart, from both backends, in document order. */
interface Drawn {
  old: Primitive[];
  vega: Primitive[];
}

const drawn = new Map<string, Drawn>();

async function draw(size: {type: SizePolicies; isShared: boolean; key?: string}): Promise<Drawn> {
  const key = JSON.stringify(size);
  if (!drawn.has(key)) {
    const scene = buildSceneForSpec(specWith(size));
    drawn.set(key, {
      old: modelFromOldSvg(renderOld(scene)).units,
      vega: modelFromVegaSvg(await renderVegaHeadless(scene)).units,
    });
  }
  return drawn.get(key)!;
}

/**
 * The four marks by the container they stand for. Position is the identity
 * here: the left column is drawn in the left half of the canvas, and `p` is
 * laid out above `q` in both.
 */
function byContainer(units: Primitive[]): Record<keyof typeof COUNTS, Primitive> {
  const left = units.filter(u => u.cx < WIDTH / 2).sort((a, b) => a.cy - b.cy);
  const right = units.filter(u => u.cx >= WIDTH / 2).sort((a, b) => a.cy - b.cy);
  expect(left.length, 'expected two marks in the left column').toBe(2);
  expect(right.length, 'expected two marks in the right column').toBe(2);
  return {Lp: left[0], Lq: left[1], Rp: right[0], Rq: right[1]};
}

/** Radii keyed by container, from whichever backend. */
function radii(units: Primitive[]): Record<keyof typeof COUNTS, number> {
  const marks = byContainer(units);
  return {Lp: marks.Lp.radius, Lq: marks.Lq.radius, Rp: marks.Rp.radius, Rq: marks.Rq.radius};
}

/**
 * The largest circle each container has room for, read off the `max` policy,
 * which is exactly that by definition. Everything else is measured against it:
 * a mark that comes out bigger has left its box.
 */
let room: Record<keyof typeof COUNTS, number>;

beforeAll(async () => {
  room = radii((await draw({type: 'max', isShared: false})).vega);
}, 60000);

const NAMES = ['Lp', 'Lq', 'Rp', 'Rq'] as const;

describe('the containers the policies are read over', () => {
  it('differ within a column and between the columns', () => {
    // Within: the left column is split 1 row against 3, so its two containers
    // are different sizes and a policy that takes the smallest has a choice to
    // make. Between: the right column is split evenly, so the smallest
    // container there is not the smallest in the chart -- which is what tells
    // a group sized against its parent apart from one sized against the chart.
    expect(room.Lp).not.toBeCloseTo(room.Lq, 2);
    expect(Math.min(room.Lp, room.Lq)).not.toBeCloseTo(Math.min(room.Rp, room.Rq), 2);
  });
});

describe.each([
  {type: 'max', isShared: false},
  {type: 'max', isShared: true},
  {type: 'uniform', isShared: false},
  {type: 'uniform', isShared: true},
  {type: 'count', isShared: false},
  {type: 'count', isShared: true},
  {type: 'sum', key: 'weight', isShared: false},
  {type: 'sum', key: 'weight', isShared: true},
] as {type: SizePolicies; isShared: boolean; key?: string}[])('%o', size => {
  it('draws the same radii in both backends', async () => {
    const {old, vega} = await draw(size);
    expect(vega.length).toBe(old.length);
    NAMES.forEach(name => {
      expect(radii(vega)[name], name).toBeCloseTo(radii(old)[name], 2);
    });
  });

  it('keeps every mark inside its own container', async () => {
    const drawnRadii = radii((await draw(size)).vega);
    NAMES.forEach(name => {
      expect(drawnRadii[name], name).toBeLessThanOrEqual(room[name] + 1e-6);
    });
  });
});

describe('max', () => {
  it('inscribes each mark in its own container', async () => {
    const drawnRadii = radii((await draw({type: 'max', isShared: false})).vega);
    NAMES.forEach(name => expect(drawnRadii[name], name).toBeCloseTo(room[name], 2));
  });

  it('draws every mark at the tightest container in the chart when shared', async () => {
    const drawnRadii = radii((await draw({type: 'max', isShared: true})).vega);
    const smallest = Math.min(...NAMES.map(name => room[name]));
    NAMES.forEach(name => expect(drawnRadii[name], name).toBeCloseTo(smallest, 2));
  });
});

describe('uniform', () => {
  it('draws one size for the whole chart when shared: the largest that fits everywhere', async () => {
    const drawnRadii = radii((await draw({type: 'uniform', isShared: true})).vega);
    const smallest = Math.min(...NAMES.map(name => room[name]));
    NAMES.forEach(name => expect(drawnRadii[name], name).toBeCloseTo(smallest, 2));
  });

  it('draws one size per parent container when not shared', async () => {
    const drawnRadii = radii((await draw({type: 'uniform', isShared: false})).vega);
    expect(drawnRadii.Lp).toBeCloseTo(Math.min(room.Lp, room.Lq), 2);
    expect(drawnRadii.Lq).toBeCloseTo(drawnRadii.Lp, 2);
    expect(drawnRadii.Rp).toBeCloseTo(Math.min(room.Rp, room.Rq), 2);
    expect(drawnRadii.Rq).toBeCloseTo(drawnRadii.Rp, 2);
    // The two columns are sized against different contents, which is the whole
    // difference between this and the shared policy.
    expect(drawnRadii.Lp).not.toBeCloseTo(drawnRadii.Rp, 2);
  });
});

describe('count', () => {
  it('makes area proportional to the rows in the container', async () => {
    const drawnRadii = radii((await draw({type: 'count', isShared: true})).vega);
    // Three rows against one is three times the area, so sqrt(3) the radius.
    expect(drawnRadii.Lq / drawnRadii.Lp).toBeCloseTo(Math.sqrt(COUNTS.Lq / COUNTS.Lp), 2);
    expect(drawnRadii.Rp / drawnRadii.Lq).toBeCloseTo(Math.sqrt(COUNTS.Rp / COUNTS.Lq), 2);
  });

  it('draws the largest count at the size uniform would have used', async () => {
    const shared = radii((await draw({type: 'count', isShared: true})).vega);
    const uniform = radii((await draw({type: 'uniform', isShared: true})).vega);
    // Rp holds the most rows in the chart, so it is the mark that fills the room.
    expect(shared.Rp).toBeCloseTo(uniform.Rp, 2);
    expect(shared.Lp).toBeLessThan(uniform.Lp);
  });

  it('scales each parent container to its own largest count when not shared', async () => {
    const isolated = radii((await draw({type: 'count', isShared: false})).vega);
    const uniform = radii((await draw({type: 'uniform', isShared: false})).vega);
    // Lq is the biggest group in the left column and Rp ties for the right, so
    // both are drawn at their own column's uniform size.
    expect(isolated.Lq).toBeCloseTo(uniform.Lq, 2);
    expect(isolated.Rp).toBeCloseTo(uniform.Rp, 2);
    expect(isolated.Lp).toBeCloseTo(uniform.Lp * Math.sqrt(COUNTS.Lp / COUNTS.Lq), 2);
  });
});

describe('sum', () => {
  it('sums the key over the container, which here is count times the weight', async () => {
    // Every row carries the same weight, so summing it is counting scaled --
    // and a scale factor is exactly what an area proportion divides out.
    const summed = radii((await draw({type: 'sum', key: 'weight', isShared: true})).vega);
    const counted = radii((await draw({type: 'count', isShared: true})).vega);
    NAMES.forEach(name => expect(summed[name], name).toBeCloseTo(counted[name], 2));
  });

  it('reads its own key rather than the layout\'s', async () => {
    const rows = ROWS.map((row, index) => ({...row, heavy: index === 0 ? 100 : 1}));
    const spec = {...specWith({type: 'sum', key: 'heavy', isShared: true}), data: {values: rows}};
    const scene = buildSceneForSpec(spec);
    const drawnRadii = radii(modelFromVegaSvg(await renderVegaHeadless(scene)).units);
    // The one heavy row is in Lp, the container with the fewest rows in it, so
    // sizing by `heavy` inverts what counting would have drawn.
    expect(drawnRadii.Lp).toBeGreaterThan(drawnRadii.Lq);
    expect(drawnRadii.Lp).toBeGreaterThan(drawnRadii.Rp);
  });

  it('draws nothing for a container whose sum is zero', async () => {
    const rows = ROWS.map(row => ({...row, weight: row.side === 'L' ? 0 : 2}));
    const spec = {...specWith({type: 'sum', key: 'weight', isShared: true}), data: {values: rows}};
    const scene = buildSceneForSpec(spec);
    const drawnRadii = radii(modelFromOldSvg(renderOld(scene)).units);
    expect(drawnRadii.Lp).toBe(0);
    expect(drawnRadii.Lq).toBe(0);
    expect(drawnRadii.Rp).toBeGreaterThan(0);
  });

  it('raises on both backends when there is no key to sum', () => {
    const scene = buildSceneForSpec(specWith({type: 'sum', isShared: true}));
    expect(() => buildVegaSpec(scene.spec, scene.data)).toThrow(/needs a `key`/);
    expect(() => renderOld(scene)).toThrow(/needs a `key`/);
  });
});
