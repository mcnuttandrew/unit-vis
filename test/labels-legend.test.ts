/**
 * `spec.labels` and `spec.legend` are decorations the vega backend draws and
 * the old one has no counterpart for. Two things are being pinned here: that
 * the vega backend draws what was asked for, and that a spec carrying either
 * option is still a spec the old backend renders exactly as it did before.
 */
import {describe, expect, it} from 'vitest';
import {buildVegaSpec} from '../library/drawing-vega';
import {classifyPath} from './harness/path-geometry';
import {buildSceneForSpec, collectVegaLogs, renderOld, renderVegaHeadless} from './harness/render';
import {modelFromVegaSvg, parseSvg, parseTransform} from './harness/svg-model';
import {ALL_SPECS} from './harness/specs';
import type {Labels, Legend, Spec} from '../library/index.d';

/**
 * A groupby over species with a flatten under it: one level that names its
 * groups and one that does not, which is what the default label selection has
 * to tell apart. The rows are grouped by species in the file, so this one runs
 * on the whole dataset -- a prefix of it is a single group.
 */
const BASE = 'penguins_species_column';

function specWith(decorations: {labels?: boolean | Labels; legend?: boolean | Legend}): Spec {
  const base = ALL_SPECS.find(s => s.name === BASE)!.spec;
  return {...(JSON.parse(JSON.stringify(base)) as Spec), ...decorations};
}

async function renderVega(decorations: Parameters<typeof specWith>[0]): Promise<string> {
  return renderVegaHeadless(buildSceneForSpec(specWith(decorations)));
}

/** The text vega drew, in document order. */
function texts(svg: string): string[] {
  return Array.from(parseSvg(svg).querySelectorAll('text')).map(t => t.textContent || '');
}

function labelElements(svg: string): Element[] {
  return Array.from(parseSvg(svg).querySelectorAll('g.labelMarks text'));
}

/** Text drawn by the label marks alone, i.e. not by the legend. */
function labelTexts(svg: string): string[] {
  return labelElements(svg).map(t => t.textContent || '');
}

/** Vega positions text by transform rather than by x/y. */
function anchor(text: Element): {x: number; y: number} {
  const {e, f} = parseTransform(text.getAttribute('transform'));
  return {x: e, y: f};
}

const SPECIES = ['Adelie', 'Chinstrap', 'Gentoo'];

describe('by default', () => {
  it('draws neither labels nor a legend', async () => {
    expect(texts(await renderVega({}))).toEqual([]);
  });

  it('leaves the vega spec exactly as it was before the options existed', () => {
    const scene = buildSceneForSpec(specWith({}));
    const vegaSpec = buildVegaSpec(scene.rootContainer, scene.spec) as Record<string, unknown>;
    expect(vegaSpec.autosize).toEqual({type: 'none'});
    expect(vegaSpec.legends).toBeUndefined();
    expect((vegaSpec.marks as {name: string}[]).map(m => m.name)).toEqual([
      'containerMarks',
      'unitMarks',
      'unitArcMarks',
    ]);
  });
});

describe('labels', () => {
  it('labels the groups a groupby names, and nothing else', async () => {
    expect(labelTexts(await renderVega({labels: true})).sort()).toEqual(SPECIES);
  });

  /**
   * A `flatten` level labels its containers by position within the group, so
   * turning labels on must not print a row number under every mark. Asking for
   * that level by name is still allowed.
   */
  it('skips flatten levels unless they are asked for by name', async () => {
    const named = labelTexts(await renderVega({labels: {layouts: ['penguins']}}));
    expect(named.length).toBeGreaterThan(SPECIES.length);
    expect(named.every(text => /^\d+$/.test(text))).toBe(true);
  });

  it('labels only the layouts it was given', async () => {
    expect(labelTexts(await renderVega({labels: {layouts: ['species']}})).sort()).toEqual(SPECIES);
    expect(labelTexts(await renderVega({labels: {layouts: ['no-such-layout']}}))).toEqual([]);
  });

  it('anchors the text to the side `orient` names', async () => {
    const positions = async (labels: Labels): Promise<{x: number; y: number}[]> =>
      labelElements(await renderVega({labels}))
        .map(anchor)
        .sort((a, b) => a.x - b.x || a.y - b.y);

    const [bottom, top, left, right] = await Promise.all([
      positions({}),
      positions({orient: 'top'}),
      positions({orient: 'left'}),
      positions({orient: 'right'}),
    ]);

    // Bottom is the default, and sits below its own top counterpart.
    expect(bottom.length).toBe(SPECIES.length);
    bottom.forEach((point, i) => {
      expect(point.y).toBeGreaterThan(top[i].y);
      expect(point.x).toBeCloseTo(top[i].x, 3);
    });
    // The side orientations move along the other axis instead.
    left.forEach((point, i) => {
      expect(point.x).toBeLessThan(right[i].x);
      expect(point.y).toBeCloseTo(right[i].y, 3);
    });
  });

  it('honors the size and color it is given', async () => {
    const text = labelElements(await renderVega({labels: {fontSize: 22, color: '#ff0000'}}))[0];
    expect(text.getAttribute('font-size')).toBe('22px');
    expect(text.getAttribute('fill')).toBe('#ff0000');
  });

  // Same font either way, so the whole difference is the gap that was asked for.
  it('holds the text `offset` pixels clear of the container edge', async () => {
    const far = labelElements(await renderVega({labels: {offset: 20}}))[0];
    const near = labelElements(await renderVega({labels: {offset: 0}}))[0];
    expect(anchor(far).y - anchor(near).y).toBeCloseTo(20, 3);
  });
});

describe('legend', () => {
  it('draws one entry per value of the color key, titled by that key', async () => {
    const svg = await renderVega({legend: true});
    const legend = parseSvg(svg).querySelector('g.role-legend')!;
    expect(legend).toBeTruthy();
    const entries = Array.from(legend.querySelectorAll('text')).map(t => t.textContent);
    expect(entries).toContain('species');
    SPECIES.forEach(species => expect(entries).toContain(species));
  });

  it('takes the title it is given', async () => {
    const svg = await renderVega({legend: {title: 'Penguin species'}});
    const entries = Array.from(parseSvg(svg).querySelectorAll('g.role-legend text')).map(t => t.textContent);
    expect(entries).toContain('Penguin species');
    expect(entries).not.toContain('species');
  });

  /**
   * The swatch stands for a mark, so it is shaped like one: vega's default
   * circle for circle units, a square for rect units.
   */
  it('shapes the swatches like the marks they stand for', async () => {
    const swatches = async (name: string): Promise<string[]> => {
      const spec = {...(JSON.parse(JSON.stringify(ALL_SPECS.find(s => s.name === name)!.spec)) as Spec), legend: true};
      const svg = await renderVegaHeadless(buildSceneForSpec(spec));
      return Array.from(parseSvg(svg).querySelectorAll('g.role-legend-symbol path')).map(p =>
        classifyPath(p.getAttribute('d') || ''),
      );
    };

    const circles = await swatches(BASE);
    expect(circles.length).toBeGreaterThan(0);
    expect(new Set(circles)).toEqual(new Set(['circle']));

    const rects = await swatches('penguins_mass_sum_by_island');
    expect(rects.length).toBeGreaterThan(0);
    expect(new Set(rects)).toEqual(new Set(['rect']));
  });

  it('is dropped when the marks are not colored by anything', () => {
    const spec = specWith({legend: true});
    delete spec.mark!.color.key;
    const scene = buildSceneForSpec(spec);
    const vegaSpec = buildVegaSpec(scene.rootContainer, scene.spec) as Record<string, unknown>;
    expect(vegaSpec.legends).toBeUndefined();
  });
});

/**
 * Decorations live outside the plot area, so the chart pads rather than
 * clipping them: the units keep their size and their positions relative to each
 * other, and the svg around them grows.
 */
describe('the space a decoration takes', () => {
  it('grows the svg without resizing the chart', async () => {
    const plain = modelFromVegaSvg(await renderVega({}));
    const decorated = modelFromVegaSvg(await renderVega({labels: true, legend: true}));

    expect(decorated.width).toBeGreaterThan(plain.width);
    expect(decorated.units.length).toBe(plain.units.length);

    const shiftX = decorated.units[0].cx - plain.units[0].cx;
    const shiftY = decorated.units[0].cy - plain.units[0].cy;
    decorated.units.forEach((unit, i) => {
      expect(unit.radius).toBeCloseTo(plain.units[i].radius, 3);
      expect(unit.cx - plain.units[i].cx).toBeCloseTo(shiftX, 3);
      expect(unit.cy - plain.units[i].cy).toBeCloseTo(shiftY, 3);
    });
  });

  it('leaves the labels themselves out of the unit and box counts', async () => {
    const decorated = modelFromVegaSvg(await renderVega({labels: true, legend: true}));
    expect(decorated.unclassified).toEqual([]);
  });

  it('draws both decorations without vega complaining', async () => {
    const logs = await collectVegaLogs(buildSceneForSpec(specWith({labels: true, legend: true})));
    expect(logs.errors).toEqual([]);
    expect(logs.warnings).toEqual([]);
  });
});

describe('the old backend', () => {
  it('renders a decorated spec exactly as it renders an undecorated one', () => {
    const plain = renderOld(buildSceneForSpec(specWith({})), 'old-plain');
    const decorated = renderOld(
      buildSceneForSpec(specWith({labels: true, legend: {orient: 'left'}})),
      'old-decorated',
    );
    expect(decorated).toBe(plain);
  });
});
