/**
 * Per-backend well-formedness. These checks do not compare the two backends
 * mark for mark; they ask whether a rendering is a usable chart at all — finite
 * coordinates, visible marks, nothing spilling off the canvas, nothing piled up.
 *
 * Absolute checks apply to both backends. Where the old backend is itself
 * sloppy (it happily emits negative radii), the check is comparative instead:
 * the vega backend must be no worse.
 */
import {beforeAll, describe, expect, it} from 'vitest';
import {formatQuality, inspect, type QualityReport} from './harness/compare';
import {checkParity, KNOWN_LAYOUT_FAILURES} from './harness/known-differences';
import {
  buildSceneForSpec,
  collectVegaLogs,
  renderOld,
  renderVegaEmbedded,
  renderVegaHeadless,
} from './harness/render';
import {modelFromOldSvg, modelFromVegaSvg} from './harness/svg-model';
import {PARITY_SPECS} from './harness/specs';

const SAMPLE_SIZE = 120;
const SPECS = PARITY_SPECS.filter(s => !(s.name in KNOWN_LAYOUT_FAILURES));
const BACKENDS = ['old', 'vega'] as const;

interface Quality {
  old: QualityReport;
  vega: QualityReport;
  rows: number;
}

const qualities = new Map<string, Quality>();

beforeAll(async () => {
  for (const {name, spec} of SPECS) {
    const scene = buildSceneForSpec(spec, SAMPLE_SIZE);
    qualities.set(name, {
      old: inspect(modelFromOldSvg(renderOld(scene))),
      vega: inspect(modelFromVegaSvg(await renderVegaHeadless(scene))),
      rows: scene.data.length,
    });
  }
}, 300000);

describe.each(SPECS.map(s => s.name))('%s', specName => {
  const report = (backend: (typeof BACKENDS)[number]): QualityReport => qualities.get(specName)![backend];

  it.each(BACKENDS)('%s: every mark has finite geometry', backend => {
    expect(report(backend).nonFinite.map(p => p.source), formatQuality(backend, report(backend))).toEqual([]);
  });

  it.each(BACKENDS)('%s: every mark resolves a fill', backend => {
    expect(report(backend).unfilled.length, formatQuality(backend, report(backend))).toBe(0);
  });

  it.each(BACKENDS)('%s: nothing in the svg is unclassifiable', backend => {
    expect(report(backend).unclassified, formatQuality(backend, report(backend))).toEqual([]);
  });

  it('draws a visible chart in both backends', () => {
    checkParity(specName, 'draws a visible chart in both backends', () => {
      BACKENDS.forEach(backend => {
        const visible = report(backend).markCount - report(backend).degenerate.length;
        expect(visible, `${backend} drew no visible marks\n${formatQuality(backend, report(backend))}`).toBeGreaterThan(0);
      });
    });
  });

  it('vega: no mark collapses to nothing', () => {
    checkParity(specName, 'vega: no mark collapses to nothing', () => {
      expect(report('vega').degenerate.length, formatQuality('vega', report('vega'))).toBeLessThanOrEqual(
        report('old').degenerate.length,
      );
    });
  });

  it('vega: every mark stays on the canvas', () => {
    checkParity(specName, 'vega: every mark stays on the canvas', () => {
      expect(report('vega').outOfBounds.length, formatQuality('vega', report('vega'))).toBeLessThanOrEqual(
        report('old').outOfBounds.length,
      );
    });
  });

  it('vega: marks do not pile on top of each other', () => {
    checkParity(specName, 'vega: marks do not pile on top of each other', () => {
      // Unit charts give each datum its own cell; the old backend sets the bar
      // for how much incidental touching a given spec allows.
      expect(report('vega').overlapRatio, formatQuality('vega', report('vega'))).toBeLessThanOrEqual(
        report('old').overlapRatio + 0.01,
      );
    });
  });
});

describe('the vega dataflow', () => {
  it.each(SPECS.map(s => s.name))('%s builds a view without warnings or errors', async specName => {
    const {spec} = SPECS.find(s => s.name === specName)!;
    const scene = buildSceneForSpec(spec, SAMPLE_SIZE);
    const {warnings, errors} = await collectVegaLogs(scene);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe('the embedded code path', () => {
  // The checks above measure `renderVegaHeadless`. This confirms that shipping
  // `drawUnitVega` into a real document -- a live `View`, mounted, hovering --
  // draws the same thing, so the fast path is a valid stand-in for what the
  // browser runs.
  it.each(SPECS.slice(0, 5).map(s => s.name))('%s matches the headless rendering', async specName => {
    const {spec} = SPECS.find(s => s.name === specName)!;
    const scene = buildSceneForSpec(spec, 60);
    const embedded = modelFromVegaSvg(await renderVegaEmbedded(scene));
    const headless = modelFromVegaSvg(await renderVegaHeadless(scene));
    expect(embedded.units.length).toBe(headless.units.length);
    expect(embedded.units.map(u => [u.cx, u.cy, u.fill])).toEqual(headless.units.map(u => [u.cx, u.cy, u.fill]));
  });
});
