/**
 * Color schemes are named in specs the d3 way (`schemeDark2`), which is what
 * the old backend feeds to `d3-scale-chromatic`. Vega's scheme registry uses
 * the bare name (`dark2`), so `buildVegaSpec` translates and then lets vega
 * resolve the palette. The specs in `src/specs` only name schemes the two
 * registries agree on -- `schemeTableau10` is not one of them -- so the
 * translation itself is covered here rather than there.
 */
import {describe, expect, it} from 'vitest';
import {buildSceneForSpec, renderOld, renderVegaHeadless} from './harness/render';
import {modelFromOldSvg, modelFromVegaSvg} from './harness/svg-model';
import {ALL_SPECS} from './harness/specs';
import type {Schemes, Spec} from '@unit-vis/core';

const BASE = 'unit_column_chart';
const SAMPLE_SIZE = 60;

function withScheme(scheme?: string): Spec {
  const base = ALL_SPECS.find(s => s.name === BASE)!.spec;
  const spec = JSON.parse(JSON.stringify(base)) as Spec;
  if (scheme) {
    spec.mark!.color.scheme = scheme as Schemes;
  }
  return spec;
}

const unique = (values: (string | null)[]): string[] =>
  [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

function oldFills(scheme?: string): string[] {
  return unique(modelFromOldSvg(renderOld(buildSceneForSpec(withScheme(scheme), SAMPLE_SIZE))).units.map(u => u.fill));
}

async function vegaFills(scheme?: string): Promise<string[]> {
  const svg = await renderVegaHeadless(buildSceneForSpec(withScheme(scheme), SAMPLE_SIZE));
  return unique(modelFromVegaSvg(svg).units.map(u => u.fill));
}

describe('color schemes', () => {
  it('defaults to category10 in both backends', async () => {
    const old = oldFills();
    expect(old.length).toBeGreaterThan(1);
    expect(await vegaFills()).toEqual(old);
  });

  // Every d3 scheme vega also ships under the same (de-prefixed) name.
  it.each(['schemeDark2', 'schemeSet2', 'schemeAccent', 'schemeSet1', 'schemePastel1'])(
    'resolves the d3 name %s to the palette the old backend used',
    async scheme => {
      const old = oldFills(scheme);
      expect(old.length).toBeGreaterThan(1);
      expect(await vegaFills(scheme)).toEqual(old);
    },
  );

  /**
   * The one scheme where the two registries genuinely disagree: vega's
   * `tableau10` is its own palette, not d3's `schemeTableau10`. Pinned so that
   * a change on either side shows up as a failure rather than as a silent
   * recoloring.
   */
  it('picks up vega tableau10, which is not d3 tableau10', async () => {
    expect(oldFills('schemeTableau10')).toEqual(['#4e79a7', '#f28e2c']);
    expect(await vegaFills('schemeTableau10')).toEqual(['#4c78a8', '#f58518']);
  });

  it('leaves a bare vega scheme name alone', async () => {
    // The old backend cannot take these at all -- `d3-scale-chromatic` has no
    // `dark2` export -- so this is a vega-only check.
    expect(await vegaFills('dark2')).toEqual(await vegaFills('schemeDark2'));
  });
});
