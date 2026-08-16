/**
 * Tests for the harness itself. Every parity claim rests on the path sampler
 * and the transform flattening below, so they get their own checks against
 * hand-written markup.
 */
import {describe, expect, it} from 'vitest';
import {boundingBox, classifyPath, samplePath} from './harness/path-geometry';
import {modelFromOldSvg, modelFromVegaSvg, normalizeColor, parseTransform} from './harness/svg-model';
import {compare, overlapRatio} from './harness/compare';

describe('path sampling', () => {
  it('bounds a vega rect path', () => {
    expect(boundingBox(samplePath('M5,6h20v30h-20Z'))).toEqual({x: 5, y: 6, width: 20, height: 30});
    expect(classifyPath('M5,6h20v30h-20Z')).toBe('rect');
  });

  it('bounds a vega full-circle arc path', () => {
    const box = boundingBox(samplePath('M0,-7A7,7,0,1,1,0,7A7,7,0,1,1,0,-7Z'))!;
    expect(box.x).toBeCloseTo(-7, 2);
    expect(box.y).toBeCloseTo(-7, 2);
    expect(box.width).toBeCloseTo(14, 2);
    expect(box.height).toBeCloseTo(14, 2);
    expect(classifyPath('M0,-7A7,7,0,1,1,0,7A7,7,0,1,1,0,-7Z')).toBe('circle');
  });

  it('handles relative commands and cubic curves', () => {
    const box = boundingBox(samplePath('M0,0 c0,-10 10,-10 10,0'))!;
    expect(box.x).toBeCloseTo(0, 2);
    expect(box.width).toBeCloseTo(10, 2);
    // The curve dips above the baseline but never reaches the control points.
    expect(box.y).toBeGreaterThan(-10);
    expect(box.y).toBeLessThan(0);
  });
});

describe('transforms', () => {
  it('parses translate with either separator', () => {
    expect(parseTransform('translate(3, 4)')).toMatchObject({e: 3, f: 4});
    expect(parseTransform('translate(3 4)')).toMatchObject({e: 3, f: 4});
  });

  it('composes nested transforms', () => {
    expect(parseTransform('translate(10,10) scale(2)')).toMatchObject({a: 2, d: 2, e: 10, f: 10});
  });
});

describe('color normalization', () => {
  it('reduces every notation to hex', () => {
    expect(normalizeColor('rgb(31, 119, 180)')).toBe('#1f77b4');
    expect(normalizeColor('#1F77B4')).toBe('#1f77b4');
    expect(normalizeColor('purple')).toBe('#800080');
    expect(normalizeColor('none')).toBeNull();
  });
});

describe('old-backend extraction', () => {
  const svg = `
    <svg width="100" height="100">
      <g class="root" transform="translate(0, 0)">
        <g class="layout1" transform="translate(10, 20)">
          <rect x="0" y="0" width="50" height="50" style="fill: white; opacity: 0.5;"></rect>
          <g class="layout2" transform="translate(5, 5)">
            <rect x="0" y="0" width="10" height="10" style="fill: white;"></rect>
            <circle cx="5" cy="5" r="4" style="fill: rgb(31, 119, 180);"></circle>
          </g>
        </g>
      </g>
    </svg>`;

  it('flattens nested translates into absolute coordinates', () => {
    const model = modelFromOldSvg(svg);
    expect(model.units).toHaveLength(1);
    expect(model.units[0]).toMatchObject({cx: 20, cy: 30, radius: 4, fill: '#1f77b4', shape: 'circle'});
  });

  it('separates layout boxes from unit marks', () => {
    const model = modelFromOldSvg(svg);
    expect(model.boxes).toHaveLength(2);
    expect(model.boxes.map(b => [b.x, b.y, b.width, b.height])).toEqual([
      [10, 20, 50, 50],
      [15, 25, 10, 10],
    ]);
    expect(model.unclassified).toEqual([]);
  });

  it('treats a second rect in a group as a unit mark', () => {
    const rectMarks = `
      <svg width="100" height="100">
        <g class="root" transform="translate(0,0)">
          <g class="layout1" transform="translate(2, 3)">
            <rect x="0" y="0" width="20" height="20" style="fill: white;"></rect>
            <rect x="0" y="0" width="8" height="8" style="fill: purple;"></rect>
          </g>
        </g>
      </svg>`;
    const model = modelFromOldSvg(rectMarks);
    expect(model.boxes).toHaveLength(1);
    expect(model.units).toHaveLength(1);
    expect(model.units[0]).toMatchObject({x: 2, y: 3, width: 8, height: 8, fill: '#800080'});
  });
});

describe('vega extraction', () => {
  const svg = `
    <svg width="100" height="100">
      <g transform="translate(0,0)">
        <g class="mark-group role-frame root">
          <g transform="translate(1,2)">
            <path class="background" d="M0,0h100v100h-100Z"/>
            <g>
              <g class="mark-rect role-mark containerMarks"><path d="M5,6h20v30h-20Z" fill="white"/></g>
              <g class="mark-arc role-mark unitArcMarks">
                <path transform="translate(50,50)" d="M0,-7A7,7,0,1,1,0,7A7,7,0,1,1,0,-7Z" fill="#1f77b4"/>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>`;

  it('reads mark roles off the vega mark names', () => {
    const model = modelFromVegaSvg(svg);
    expect(model.boxes).toHaveLength(1);
    expect(model.units).toHaveLength(1);
    expect(model.unclassified).toEqual([]);
  });

  it('applies ancestor and per-mark transforms', () => {
    const model = modelFromVegaSvg(svg);
    // group translate(1,2) + mark translate(50,50), radius 7
    expect(model.units[0].cx).toBeCloseTo(51, 2);
    expect(model.units[0].cy).toBeCloseTo(52, 2);
    expect(model.units[0].radius).toBeCloseTo(7, 2);
    expect(model.boxes[0]).toMatchObject({x: 6, y: 8, width: 20, height: 30});
  });

  it('ignores the frame background path', () => {
    expect(modelFromVegaSvg(svg).units.map(u => u.width)).toEqual([14]);
  });
});

describe('comparison metrics', () => {
  const model = (units: Array<{cx: number; cy: number; r: number; fill: string}>) => ({
    width: 100,
    height: 100,
    boxes: [],
    unclassified: [],
    units: units.map(u => ({
      role: 'unit' as const,
      shape: 'circle' as const,
      x: u.cx - u.r,
      y: u.cy - u.r,
      width: 2 * u.r,
      height: 2 * u.r,
      cx: u.cx,
      cy: u.cy,
      radius: u.r,
      fill: u.fill,
      fillOpacity: 1,
      stroke: null,
      strokeWidth: null,
      source: 'test',
    })),
  });

  it('scores identical renderings as a perfect match', () => {
    const a = model([{cx: 10, cy: 10, r: 5, fill: '#111111'}]);
    const report = compare(a, model([{cx: 10, cy: 10, r: 5, fill: '#111111'}]));
    expect(report.positionAgreement).toBe(1);
    expect(report.fillAgreement).toBe(1);
    expect(report.unmatchedNearest).toBe(0);
  });

  it('catches a flipped y axis', () => {
    const left = model([
      {cx: 10, cy: 10, r: 5, fill: '#111111'},
      {cx: 10, cy: 90, r: 5, fill: '#111111'},
    ]);
    const right = model([
      {cx: 10, cy: 90, r: 5, fill: '#111111'},
      {cx: 10, cy: 10, r: 5, fill: '#111111'},
    ]);
    const report = compare(left, right);
    expect(report.positionAgreement).toBe(0);
    // Same picture, different order: nearest-neighbor still matches everything.
    expect(report.unmatchedNearest).toBe(0);
  });

  it('separates a palette swap from a mis-encoding', () => {
    const left = model([
      {cx: 10, cy: 10, r: 5, fill: '#111111'},
      {cx: 20, cy: 10, r: 5, fill: '#222222'},
    ]);
    const swapped = model([
      {cx: 10, cy: 10, r: 5, fill: '#aaaaaa'},
      {cx: 20, cy: 10, r: 5, fill: '#bbbbbb'},
    ]);
    const scrambled = model([
      {cx: 10, cy: 10, r: 5, fill: '#111111'},
      {cx: 20, cy: 10, r: 5, fill: '#111111'},
    ]);
    expect(compare(left, swapped).colorPartitionMatches).toBe(true);
    expect(compare(left, swapped).fillAgreement).toBe(0);
    expect(compare(left, scrambled).colorPartitionMatches).toBe(false);
  });

  it('treats a pair of marks that render nothing as agreeing', () => {
    // The old backend writes an invalid negative radius where vega clamps to 0.
    // Neither paints anything, so shape and size are not in disagreement — but
    // the pair is still counted.
    const negative = model([{cx: 10, cy: 10, r: -5, fill: '#111111'}]);
    const zero = model([{cx: 10, cy: 10, r: 0, fill: '#111111'}]);
    const report = compare(negative, zero);
    expect(report.shapeAgreement).toBe(1);
    expect(report.sizeError.max).toBe(0);
    expect(report.invisiblePairs).toBe(1);
  });

  it('still reports a size difference when one mark is visible', () => {
    const visible = model([{cx: 10, cy: 10, r: 5, fill: '#111111'}]);
    const zero = model([{cx: 10, cy: 10, r: 0, fill: '#111111'}]);
    expect(compare(visible, zero).sizeError.max).toBe(10);
    expect(compare(visible, zero).invisiblePairs).toBe(0);
  });

  it('measures overlap', () => {
    const apart = model([
      {cx: 10, cy: 10, r: 4, fill: '#111111'},
      {cx: 30, cy: 10, r: 4, fill: '#111111'},
    ]);
    const stacked = model([
      {cx: 10, cy: 10, r: 4, fill: '#111111'},
      {cx: 11, cy: 10, r: 4, fill: '#111111'},
    ]);
    expect(overlapRatio(apart.units)).toBe(0);
    expect(overlapRatio(stacked.units)).toBeGreaterThan(0);
  });
});
