/**
 * The packing arms of `⟨Layout⟩`: the ones that divide a container's *area*
 * rather than one of its edges.
 *
 * Four of them used to be writable in the grammar and unanswered by the engine
 * -- a weighted `maxfill` sized by `count`, a weighted `square`/`parent` pack,
 * the four right-to-left packing directions, and `aspect_ratio: "custom"` --
 * and each failed to a blank or an overlapping chart rather than to an error.
 * These are the checks that they draw, and that the two backends draw them the
 * same way. See `docs/grammar-gaps.md`.
 *
 * The boxes are read off each backend's layout rather than out of the rendered
 * svg: this is a layout question, and the container geometry is where the
 * answer is.
 */
import {describe, expect, it} from 'vitest';
import * as vega from 'vega';
import {applyDefault, buildScene, isContainer} from '@unit-vis/core';
import type {Container, DataRow, Layout, Spec} from '@unit-vis/core';
import {buildVegaSpec, levelName} from 'unit-vis-vega';

/** Small enough to reason about by hand, uneven enough to tell weightings apart. */
const ROWS: DataRow[] = [
  {g: 'a', v: 10},
  {g: 'a', v: 20},
  {g: 'b', v: 30},
  {g: 'b', v: 5},
  {g: 'c', v: 15},
];

/** What each group of `g` sums to, in `getKeys` order. */
const GROUP_SUMS = [30, 35, 15];
const GROUP_COUNTS = [2, 2, 1];
const ROW_VALUES = ROWS.map(row => Number(row.v));

const WIDTH = 300;
const HEIGHT = 200;
const SLACK = 1e-6;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function specWith(layouts: Partial<Layout>[]): Spec {
  const spec = {
    width: WIDTH,
    height: HEIGHT,
    data: {values: ROWS.map(row => ({...row}))},
    layouts,
    mark: {shape: 'rect', color: {key: 'g', type: 'categorical'}, size: {type: 'max'}},
  } as unknown as Spec;
  applyDefault(spec);
  return spec;
}

/** The deepest level's boxes, in absolute coordinates, as the JS engine lays them out. */
function engineBoxes(spec: Spec): Box[] {
  const {rootContainer} = buildScene(
    (spec.data.values as DataRow[]).map(row => ({...row})),
    spec,
  );
  const depth = spec.layouts.length;
  const boxes: Box[] = [];

  const walk = (container: Container, level: number, x: number, y: number): void => {
    const absX = x + container.visualspace.posX;
    const absY = y + container.visualspace.posY;
    if (level === depth) {
      boxes.push({
        x: absX,
        y: absY,
        width: container.visualspace.width,
        height: container.visualspace.height,
      });
      return;
    }
    for (const child of container.contents) {
      if (isContainer(child)) {
        walk(child, level + 1, absX, absY);
      }
    }
  };

  walk(rootContainer, 0, 0, 0);
  return boxes;
}

/** The same boxes, off the compiled vega dataflow. */
async function vegaBoxes(spec: Spec): Promise<Box[]> {
  const rows = (spec.data.values as DataRow[]).map(row => ({...row}));
  const view = new vega.View(vega.parse(buildVegaSpec(spec, rows) as vega.Spec), {renderer: 'none'});
  try {
    await view.runAsync();
    const level = view.data(levelName(spec.layouts.length)) as {
      absX: number;
      absY: number;
      width: number;
      height: number;
    }[];
    return level.map(tuple => ({
      x: tuple.absX,
      y: tuple.absY,
      width: tuple.width,
      height: tuple.height,
    }));
  } finally {
    view.finalize();
  }
}

const round = (box: Box): Box => ({
  x: Math.round(box.x * 1000) / 1000,
  y: Math.round(box.y * 1000) / 1000,
  width: Math.round(box.width * 1000) / 1000,
  height: Math.round(box.height * 1000) / 1000,
});

/**
 * Lay a spec out on both backends, hold them to each other, and hand back the
 * boxes for the case's own assertions.
 *
 * The two are compared rounded, since the vega dataflow and the engine reach the
 * same numbers by slightly different routes; the boxes handed back are the
 * engine's own, so an assertion about touching edges is not asking a question
 * about the rounding.
 */
async function layoutBoxes(spec: Spec): Promise<Box[]> {
  const engine = engineBoxes(spec);
  const compiled = await vegaBoxes(spec);
  expect(compiled.map(round), 'the vega backend disagrees with the engine').toEqual(
    engine.map(round),
  );
  return engine;
}

const area = (box: Box): number => box.width * box.height;

/**
 * What each box is worth per unit of weight, sorted against the weights so that
 * the answer does not depend on the order the containers came out in.
 */
function areaPerWeight(boxes: Box[], weights: number[]): number[] {
  expect(boxes).toHaveLength(weights.length);
  const areas = boxes.map(area).sort((a, b) => a - b);
  const sorted = [...weights].sort((a, b) => a - b);
  return areas.map((value, index) => value / sorted[index]);
}

/** Every box worth the same area per unit of weight, to within rounding. */
function expectProportional(boxes: Box[], weights: number[]): void {
  const units = areaPerWeight(boxes, weights);
  units.forEach(unit => expect(unit / units[0], JSON.stringify(units)).toBeCloseTo(1, 9));
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x + a.width - SLACK > b.x &&
    b.x + b.width - SLACK > a.x &&
    a.y + a.height - SLACK > b.y &&
    b.y + b.height - SLACK > a.y
  );
}

function overlappingPairs(boxes: Box[]): [number, number][] {
  const found: [number, number][] = [];
  boxes.forEach((box, i) => {
    boxes.slice(i + 1).forEach((other, j) => {
      if (overlaps(box, other)) {
        found.push([i, i + 1 + j]);
      }
    });
  });
  return found;
}

const inside = (box: Box): boolean =>
  box.x >= -SLACK &&
  box.y >= -SLACK &&
  box.x + box.width <= WIDTH + SLACK &&
  box.y + box.height <= HEIGHT + SLACK;

/** Every box drawn, none on top of another, none off the canvas. */
function expectWellFormed(boxes: Box[]): void {
  const report = JSON.stringify(boxes);
  expect(boxes.every(box => box.width > 0 && box.height > 0), report).toBe(true);
  expect(overlappingPairs(boxes), report).toEqual([]);
  expect(boxes.every(inside), report).toBe(true);
}

describe('a weighted maxfill level', () => {
  it('sizes its treemap by row count under size.type "count"', async () => {
    const boxes = await layoutBoxes(
      specWith([{subgroup: {type: 'groupby', key: 'g'}, aspect_ratio: 'maxfill', size: {type: 'count'}}]),
    );

    expectWellFormed(boxes);
    expectProportional(boxes, GROUP_COUNTS);
    // A treemap wastes nothing, so the three of them are the whole canvas.
    expect(boxes.reduce((total, box) => total + area(box), 0)).toBeCloseTo(WIDTH * HEIGHT, 6);
  });

  it('sums a weight over every row of a group, not just the first', async () => {
    const boxes = await layoutBoxes(
      specWith([
        {subgroup: {type: 'groupby', key: 'g'}, aspect_ratio: 'maxfill', size: {type: 'sum', key: 'v'}},
      ]),
    );

    expectWellFormed(boxes);
    expectProportional(boxes, GROUP_SUMS);
  });
});

describe('a weighted square, parent or custom pack', () => {
  const cases = [
    {
      name: 'square, shared',
      level: {
        subgroup: {type: 'groupby', key: 'g'},
        aspect_ratio: 'square',
        size: {type: 'sum', key: 'v', isShared: true},
      },
      weights: GROUP_SUMS,
    },
    {
      name: 'square over rows, isolated',
      level: {
        subgroup: {type: 'flatten'},
        aspect_ratio: 'square',
        size: {type: 'sum', key: 'v', isShared: false},
      },
      weights: ROW_VALUES,
    },
    {
      name: 'parent, shared',
      level: {
        subgroup: {type: 'groupby', key: 'g'},
        aspect_ratio: 'parent',
        size: {type: 'count', isShared: true},
      },
      weights: GROUP_COUNTS,
    },
    {
      name: 'parent over rows, isolated',
      level: {
        subgroup: {type: 'flatten'},
        aspect_ratio: 'parent',
        size: {type: 'sum', key: 'v', isShared: false},
      },
      weights: ROW_VALUES,
    },
  ] as {name: string; level: Partial<Layout>; weights: number[]}[];

  it.each(cases)('$name gives every box its own space inside the parent', async ({level}) => {
    expectWellFormed(await layoutBoxes(specWith([level])));
  });

  it.each(cases)('$name makes area proportional to the value', async ({level, weights}) => {
    expectProportional(await layoutBoxes(specWith([level])), weights);
  });

  it('keeps the level aspect ratio: square boxes come out square', async () => {
    const boxes = await layoutBoxes(specWith([cases[0].level]));
    boxes.forEach(box => expect(box.width).toBeCloseTo(box.height, 9));
  });

  it("keeps the level aspect ratio: parent boxes come out the parent's shape", async () => {
    const boxes = await layoutBoxes(specWith([cases[2].level]));
    boxes.forEach(box => expect(box.width / box.height).toBeCloseTo(WIDTH / HEIGHT, 9));
  });

  it('scales sibling groups by one shared unit, and isolated ones by their own', async () => {
    const nested = (isShared: boolean): Partial<Layout>[] => [
      {subgroup: {type: 'groupby', key: 'g'}, aspect_ratio: 'fillX', size: {type: 'uniform', isShared: false}},
      {subgroup: {type: 'flatten'}, aspect_ratio: 'square', size: {type: 'sum', key: 'v', isShared}},
    ];

    // Shared: one unit of `v` buys the same area in every panel, so the boxes
    // of all three groups fall on one scale.
    expectProportional(await layoutBoxes(specWith(nested(true))), ROW_VALUES);

    // Isolated: each panel is scaled to its own rows, so they do not.
    const isolated = await layoutBoxes(specWith(nested(false)));
    const units = areaPerWeight(isolated, ROW_VALUES);
    expect(Math.max(...units) / Math.min(...units)).toBeGreaterThan(1.1);
    expectWellFormed(isolated);
  });
});

describe('packing directions', () => {
  const DIRECTIONS = ['LRTB', 'LRBT', 'RLTB', 'RLBT', 'TBLR', 'TBRL', 'BTLR', 'BTRL'] as const;

  it.each(DIRECTIONS)('%s packs a grid inside the parent, one box per row', async direction => {
    const boxes = await layoutBoxes(
      specWith([{subgroup: {type: 'flatten'}, aspect_ratio: 'maxfill', direction}]),
    );
    expect(boxes).toHaveLength(ROWS.length);
    expectWellFormed(boxes);
  });

  it.each(DIRECTIONS)('%s shelves a weighted pack inside the parent', async direction => {
    const boxes = await layoutBoxes(
      specWith([
        {
          subgroup: {type: 'flatten'},
          aspect_ratio: 'square',
          direction,
          size: {type: 'sum', key: 'v', isShared: false},
        },
      ]),
    );
    expectWellFormed(boxes);
    expectProportional(boxes, ROW_VALUES);
  });

  it('runs a right-to-left row back from the right edge', async () => {
    const grid = (direction: 'RLTB' | 'LRTB'): Spec =>
      specWith([{subgroup: {type: 'flatten'}, aspect_ratio: 'maxfill', direction}]);

    const rightToLeft = await layoutBoxes(grid('RLTB'));
    const leftToRight = await layoutBoxes(grid('LRTB'));

    expect(rightToLeft[0].x + rightToLeft[0].width).toBeCloseTo(WIDTH, 6);
    expect(leftToRight[0].x).toBeCloseTo(0, 6);
    // The same grid, mirrored: every slot one direction fills is a slot the
    // other fills too.
    const slots = (boxes: Box[]): string[] => boxes.map(box => `${round(box).x},${round(box).y}`).sort();
    expect(slots(rightToLeft)).toEqual(
      slots(leftToRight.map(box => ({...box, x: WIDTH - box.x - box.width}))),
    );
  });

  it('advances the columns of a TBRL pack leftwards', async () => {
    const boxes = await layoutBoxes(
      specWith([{subgroup: {type: 'flatten'}, aspect_ratio: 'maxfill', direction: 'TBRL'}]),
    );
    expect(boxes[0].x + boxes[0].width).toBeCloseTo(WIDTH, 6);
    expect(Math.min(...boxes.map(box => box.x))).toBeLessThan(boxes[0].x);
  });
});

describe('aspect_ratio "custom"', () => {
  it('draws its boxes at the ratio the layout supplies', async () => {
    const boxes = await layoutBoxes(
      specWith([{subgroup: {type: 'flatten'}, aspect_ratio: 'custom', custom_aspect_ratio: 2}]),
    );
    expectWellFormed(boxes);
    boxes.forEach(box => expect(box.width / box.height).toBeCloseTo(2, 9));
  });

  it('weights a custom pack by area, at that ratio', async () => {
    const boxes = await layoutBoxes(
      specWith([
        {
          subgroup: {type: 'groupby', key: 'g'},
          aspect_ratio: 'custom',
          custom_aspect_ratio: 0.5,
          size: {type: 'count', isShared: false},
        },
      ]),
    );
    expectWellFormed(boxes);
    expectProportional(boxes, GROUP_COUNTS);
    boxes.forEach(box => expect(box.width / box.height).toBeCloseTo(0.5, 9));
  });

  it('is an error without a ratio, in both backends', async () => {
    const spec = specWith([{subgroup: {type: 'flatten'}, aspect_ratio: 'custom'}]);
    expect(() => engineBoxes(spec)).toThrow(/custom_aspect_ratio/);
    await expect(vegaBoxes(spec)).rejects.toThrow(/custom_aspect_ratio/);
  });

  it('is an error on a ratio that is not a positive number', async () => {
    for (const ratio of [0, -2, Number.NaN]) {
      const spec = specWith([
        {subgroup: {type: 'flatten'}, aspect_ratio: 'custom', custom_aspect_ratio: ratio},
      ]);
      expect(() => engineBoxes(spec), `ratio ${ratio}`).toThrow(/custom_aspect_ratio/);
      await expect(vegaBoxes(spec), `ratio ${ratio}`).rejects.toThrow(/custom_aspect_ratio/);
    }
  });
});
