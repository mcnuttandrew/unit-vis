/**
 * Parity between the old d3 backend and the vega backend.
 *
 * Both backends are handed the *same* container tree, so every difference the
 * checks below can see is a drawing difference rather than a layout difference.
 * Marks are compared as geometry, not as markup: the old backend emits
 * <circle>/<rect>, vega emits <path>, and neither serialization is the point.
 *
 * Differences the port has not closed yet live in `KNOWN_DIFFERENCES`, which is
 * verified in both directions — see `harness/known-differences.ts`.
 */
import {beforeAll, describe, expect, it} from 'vitest';
import {compare, formatComparison, type ComparisonReport} from './harness/compare';
import {checkParity, KNOWN_LAYOUT_FAILURES} from './harness/known-differences';
import {buildSceneForSpec, renderOld, renderVegaHeadless} from './harness/render';
import {modelFromOldSvg, modelFromVegaSvg, type SvgModel} from './harness/svg-model';
import {ALL_SPECS, withoutDecorations} from './harness/specs';

/** Rows per spec: enough to exercise every layout branch, few enough to be quick. */
const SAMPLE_SIZE = 120;

/**
 * Vega serializes path coordinates to three decimals, so identical geometry
 * still differs in the fourth. Half a pixel is well under anything visible and
 * well over the rounding.
 */
const POSITION_TOLERANCE = 0.5;

const SPECS = ALL_SPECS.filter(s => !(s.name in KNOWN_LAYOUT_FAILURES));

interface Rendered {
  old: SvgModel;
  vega: SvgModel;
  comparison: ComparisonReport;
  rows: number;
}

async function render(specName: string, sampleSize?: number): Promise<Rendered> {
  const entry = ALL_SPECS.find(s => s.name === specName)!;
  // Decorations off on both sides: the old backend draws neither, so a spec
  // that asks for a legend would be measured against a canvas the legend grew.
  // What is being compared is the chart, which the decorations do not move.
  const scene = buildSceneForSpec(withoutDecorations(entry.spec), sampleSize);
  const oldModel = modelFromOldSvg(renderOld(scene));
  const vegaModel = modelFromVegaSvg(await renderVegaHeadless(scene));
  return {
    old: oldModel,
    vega: vegaModel,
    comparison: compare(oldModel, vegaModel, POSITION_TOLERANCE),
    rows: scene.data.length,
  };
}

const rendered = new Map<string, Rendered>();

beforeAll(async () => {
  for (const {name} of SPECS) {
    rendered.set(name, await render(name, SAMPLE_SIZE));
  }
}, 300000);

describe('the layout engine', () => {
  it.each(SPECS.map(s => s.name))('lays %s out', specName => {
    expect(rendered.get(specName)!.rows).toBeGreaterThan(0);
  });

  it('still fails only on the specs it is known to fail on', () => {
    const stillFailing = Object.keys(KNOWN_LAYOUT_FAILURES).filter(name => {
      try {
        buildSceneForSpec(ALL_SPECS.find(s => s.name === name)!.spec, SAMPLE_SIZE);
        return false;
      } catch {
        return true;
      }
    });
    expect(stillFailing.sort(), 'a spec in KNOWN_LAYOUT_FAILURES now lays out — remove it').toEqual(
      Object.keys(KNOWN_LAYOUT_FAILURES).sort(),
    );
  });
});

describe.each(SPECS.map(s => s.name))('%s', specName => {
  const get = (): Rendered => rendered.get(specName)!;
  const message = (): string => formatComparison(specName, get().comparison);
  /** Assert, unless this exact check is a registered known difference. */
  const parity = (check: string, assertion: () => void): void => checkParity(specName, check, assertion);

  it('draws one unit mark per data row in both backends', () => {
    parity('draws one unit mark per data row in both backends', () => {
      expect(get().old.units.length, message()).toBe(get().rows);
      expect(get().vega.units.length, message()).toBe(get().rows);
    });
  });

  it('uses the same canvas size', () => {
    parity('uses the same canvas size', () => {
      expect(get().comparison.canvas.right, message()).toEqual(get().comparison.canvas.left);
    });
  });

  it('places every unit mark where the old backend placed it', () => {
    parity('places every unit mark where the old backend placed it', () => {
      const drifted = get()
        .comparison.pairs.filter(p => p.centerDistance > POSITION_TOLERANCE)
        .slice(0, 5)
        .map(p => `#${p.index}: old(${p.left.cx}, ${p.left.cy}) vega(${p.right.cx}, ${p.right.cy})`);
      expect(drifted, `${message()}\n  drift sample:\n    ${drifted.join('\n    ')}`).toEqual([]);
    });
  });

  it('emits marks in the same order', () => {
    parity('emits marks in the same order', () => {
      // Nearest-neighbor agreement holds even when order does not, so a failure
      // here alongside a pass above would mean "same picture, shuffled marks".
      expect(get().comparison.unmatchedNearest, message()).toBe(0);
    });
  });

  it('sizes every unit mark the way the old backend did', () => {
    parity('sizes every unit mark the way the old backend did', () => {
      expect(get().comparison.sizeError.max, message()).toBeLessThanOrEqual(POSITION_TOLERANCE);
    });
  });

  it('draws the same mark shape', () => {
    parity('draws the same mark shape', () => {
      expect(get().comparison.shapeAgreement, message()).toBe(1);
    });
  });

  it('assigns colors by the same partition of the data', () => {
    parity('assigns colors by the same partition of the data', () => {
      expect(get().comparison.colorPartitionMatches, message()).toBe(true);
    });
  });

  it('resolves the same color scheme', () => {
    parity('resolves the same color scheme', () => {
      expect(get().comparison.fills.right, message()).toEqual(get().comparison.fills.left);
      expect(get().comparison.fillAgreement, message()).toBe(1);
    });
  });

  it('draws the same layout boxes', () => {
    parity('draws the same layout boxes', () => {
      expect(get().vega.boxes.length, message()).toBe(get().old.boxes.length);
    });
  });
});

describe('full datasets', () => {
  // The checks above sample rows to stay fast. These run a couple of specs over
  // every row, so a divergence that only shows up at scale is still caught.
  it.each(['unit_column_chart', 'titanic_spec3'])('%s matches over the whole dataset', async specName => {
    const result = await render(specName);
    const message = formatComparison(specName, result.comparison);
    expect(result.comparison.counts.rightUnits, message).toBe(result.rows);
    expect(result.comparison.positionAgreement, message).toBe(1);
    expect(result.comparison.sizeError.max, message).toBeLessThanOrEqual(POSITION_TOLERANCE);
    expect(result.comparison.fillAgreement, message).toBe(1);
  }, 120000);
});
