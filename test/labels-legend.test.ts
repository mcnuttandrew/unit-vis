/**
 * `spec.labels` and `spec.legend` are decorations the vega backend draws and
 * the old one has no counterpart for. Two things are being pinned here: that
 * the vega backend draws what was asked for, and that a spec carrying either
 * option is still a spec the old backend renders exactly as it did before.
 *
 * `labels` draws axes: a tick per group of the levels it selects, outside the
 * plot area, titled with the field that level splits on. What is being checked
 * is that the ticks land on the groups they name -- an axis derived from a
 * layout is only worth anything if it agrees with the layout.
 */
import {describe, expect, it} from 'vitest';
import * as vega from 'vega';
import {buildVegaSpec} from 'unit-vis-vega';
import {classifyPath} from './harness/path-geometry';
import {buildSceneForSpec, collectVegaLogs, renderOld, renderVegaHeadless} from './harness/render';
import type {Scene} from './harness/render';
import {modelFromVegaSvg, parseSvg, parseTransform} from './harness/svg-model';
import {ALL_SPECS, withoutDecorations} from './harness/specs';
import type {Labels, Legend, Spec} from '@unit-vis/core';

/**
 * A groupby over species with a flatten under it: one level that names its
 * groups and one that does not, which is what the default label selection has
 * to tell apart. The rows are grouped by species in the file, so this one runs
 * on the whole dataset -- a prefix of it is a single group.
 */
const BASE = 'penguins_species_column';

/**
 * The base spec with exactly the decorations named here, and no others: the
 * example specs ship with `legend` on, and `specWith({})` has to mean a chart
 * with nothing on it for the defaults below to be testing anything.
 */
function specWith(decorations: {labels?: boolean | Labels; legend?: boolean | Legend}): Spec {
  const base = ALL_SPECS.find(s => s.name === BASE)!.spec;
  return {...withoutDecorations(base), ...decorations};
}

async function renderVega(decorations: Parameters<typeof specWith>[0]): Promise<string> {
  return renderVegaHeadless(buildSceneForSpec(specWith(decorations)));
}

/** The text vega drew, in document order. */
function texts(svg: string): string[] {
  return Array.from(parseSvg(svg).querySelectorAll('text')).map(t => t.textContent || '');
}

/** One axis as the svg carries it: its group, its ticks, and its title. */
interface AxisModel {
  /** Where the axis group sits, i.e. which edge it was placed against. */
  origin: {x: number; y: number};
  title: string | null;
  /** Tick labels, with their position inside the axis group. */
  ticks: {text: string; x: number; y: number}[];
  /**
   * Whether vega drew this as a scale or as a title alone. A level that got
   * labels rather than an axis is still named by one of these, with everything
   * but the title turned off.
   */
  scaled: boolean;
}

/** Vega positions text by transform rather than by x/y. */
function anchor(element: Element): {x: number; y: number} {
  const {e, f} = parseTransform(element.getAttribute('transform'));
  return {x: e, y: f};
}

/**
 * The axes vega drew. Vega keeps every tick it generated and hides the ones it
 * culled for overlap by setting `opacity` to 0, so those are dropped here --
 * what is being measured is what a reader can see.
 */
function drawnAxes(svg: string): AxisModel[] {
  return Array.from(parseSvg(svg).querySelectorAll('g.role-axis')).map(axis => {
    const group = axis.querySelector('g')!;
    const title = axis.querySelector('g.role-axis-title text');
    return {
      origin: anchor(group),
      title: title && title.textContent,
      ticks: Array.from(axis.querySelectorAll('g.role-axis-label text'))
        .filter(text => text.getAttribute('opacity') !== '0')
        .map(text => ({text: text.textContent || '', ...anchor(text)})),
      scaled: Boolean(axis.querySelector('g.role-axis-domain')),
    };
  });
}

/** The axes proper, i.e. not the title-only ones naming a labelled level. */
function axes(svg: string): AxisModel[] {
  return drawnAxes(svg).filter(axis => axis.scaled);
}

/** The fields named over levels drawn as labels rather than as an axis. */
function labelTitles(svg: string): (string | null)[] {
  return drawnAxes(svg)
    .filter(axis => !axis.scaled)
    .map(axis => axis.title);
}

/** The one axis a spec that selects a single level drew. */
function onlyAxis(svg: string): AxisModel {
  const drawn = axes(svg);
  expect(drawn.length).toBe(1);
  return drawn[0];
}

function tickTexts(svg: string): string[] {
  return axes(svg).flatMap(axis => axis.ticks.map(tick => tick.text));
}

/**
 * Text drawn against the containers themselves, by the levels that got labels
 * rather than an axis. Each level has a mark of its own, named for its depth.
 */
function labelTexts(svg: string): string[] {
  return Array.from(parseSvg(svg).querySelectorAll('g[class*="labelMarks"] text')).map(
    text => text.textContent || '',
  );
}

const SPECIES = ['Adelie', 'Chinstrap', 'Gentoo'];

describe('by default', () => {
  it('draws neither labels nor a legend', async () => {
    expect(texts(await renderVega({}))).toEqual([]);
  });

  it('leaves the vega spec exactly as it was before the options existed', () => {
    const scene = buildSceneForSpec(specWith({}));
    const vegaSpec = buildVegaSpec(scene.spec, scene.data) as Record<string, unknown>;
    expect(vegaSpec.autosize).toEqual({type: 'none'});
    expect(vegaSpec.legends).toBeUndefined();
    expect((vegaSpec.marks as {name: string}[]).map(m => m.name)).toEqual([
      'containerMarks',
      'unitMarks',
      'unitArcMarks',
    ]);
  });
});

describe('axes', () => {
  it('draws one per level that names its groups, titled with the field', async () => {
    const axis = onlyAxis(await renderVega({labels: true}));
    expect(axis.title).toBe('species');
    expect(axis.ticks.map(tick => tick.text)).toEqual(SPECIES);
  });

  /**
   * The whole claim an axis makes is that a reader can go from a tick to the
   * part of the chart it names. The layout decided where that part is -- so the
   * tick has to sit inside the containers it was drawn for, which is checked
   * here against the very dataset the axis was derived from.
   */
  it('puts each tick within the group it names', async () => {
    const scene = buildSceneForSpec(specWith({labels: true}));
    const view = new vega.View(vega.parse(buildVegaSpec(scene.spec, scene.data) as vega.Spec), {
      renderer: 'none',
    });
    try {
      await view.runAsync();
      const containers = view.data('level1') as {label: string; absX: number; width: number}[];
      const ticks = view.data('axis1') as {__text: string; pos: number}[];
      expect(ticks.map(tick => tick.__text)).toEqual(SPECIES);
      ticks.forEach(tick => {
        const group = containers.find(c => String(c.label) === tick.__text)!;
        expect(tick.pos).toBeGreaterThanOrEqual(group.absX);
        expect(tick.pos).toBeLessThanOrEqual(group.absX + group.width);
      });
    } finally {
      view.finalize();
    }
  });

  /**
   * A `flatten` level labels its containers by position within the group, so
   * turning axes on must not annotate the chart with row numbers. Asking for
   * that level by name is still allowed -- it packs its rows into a grid, so
   * what it gets is labels on its cells rather than an axis.
   */
  it('skips flatten levels unless they are asked for by name', async () => {
    expect(labelTexts(await renderVega({labels: true}))).toEqual([]);
    const named = labelTexts(await renderVega({labels: {layouts: ['penguins']}}));
    expect(named.length).toBeGreaterThan(0);
    expect(named.every(text => /^\d+$/.test(text))).toBe(true);
  });

  it('draws axes only for the layouts it was given', async () => {
    expect(tickTexts(await renderVega({labels: {layouts: ['species']}}))).toEqual(SPECIES);
    expect(axes(await renderVega({labels: {layouts: ['no-such-layout']}}))).toEqual([]);
  });

  /**
   * The base spec splits by species and colors by species. Both guides would
   * be naming the same three groups, so the legend -- which names them however
   * the layout arranged them -- keeps it and the axis is left off.
   */
  it('leaves out the level the legend already explains', async () => {
    expect(axes(await renderVega({labels: true, legend: true}))).toEqual([]);
    // With nothing else naming those groups, the axis comes back.
    expect(tickTexts(await renderVega({labels: true}))).toEqual(SPECIES);
    // Asking for the level by name is still asking for it.
    const named = await renderVega({labels: {layouts: ['species']}, legend: true});
    expect(tickTexts(named)).toEqual(SPECIES);
  });

  /**
   * A level takes the side it divides space along, and `orient` overrides it.
   * The axis group is placed against the edge it was given, so where that group
   * sits is which side was chosen.
   */
  it('takes the side the level fills, or the one `orient` names', async () => {
    const origin = async (labels: Labels): Promise<{x: number; y: number}> =>
      onlyAxis(await renderVega({labels})).origin;

    const [own, top, left, right] = await Promise.all([
      origin({}),
      origin({orient: 'top'}),
      origin({orient: 'left'}),
      origin({orient: 'right'}),
    ]);

    // The level fills X, so left to itself the axis is read along the bottom:
    // below the plot, where its own top counterpart is above it.
    expect(own.y).toBeGreaterThan(top.y);
    expect(own.x).toBeCloseTo(top.x, 3);
    // The side orientations sit against the vertical edges instead.
    expect(left.x).toBeLessThan(right.x);
    expect(left.y).toBeCloseTo(right.y, 3);
  });

  it('honors the size and color it is given', async () => {
    const svg = await renderVega({labels: {fontSize: 22, color: '#ff0000'}});
    const text = parseSvg(svg).querySelector('g.role-axis-label text')!;
    expect(text.getAttribute('font-size')).toBe('22px');
    expect(text.getAttribute('fill')).toBe('#ff0000');
    expect(parseSvg(svg).querySelector('g.role-axis-title text')!.getAttribute('fill')).toBe('#ff0000');
  });

  it('holds the axis `offset` pixels clear of the plot', async () => {
    const far = onlyAxis(await renderVega({labels: {offset: 20}}));
    const near = onlyAxis(await renderVega({labels: {offset: 0}}));
    expect(far.origin.y - near.origin.y).toBeCloseTo(20, 3);
  });
});

/**
 * A bin level's containers are labelled with the interval they hold
 * (`3150-3675`), which is what an axis exists to avoid printing: the ticks take
 * the intervals' own edges instead, so the axis reads as the number line the
 * bins were cut out of.
 */
describe('axes over binned levels', () => {
  const HISTOGRAM = 'penguins_body_mass_histogram';

  async function histogramAxis(): Promise<AxisModel> {
    const base = ALL_SPECS.find(s => s.name === HISTOGRAM)!.spec;
    const spec = {...withoutDecorations(base), labels: {layouts: ['mass_bin']}};
    return onlyAxis(await renderVegaHeadless(buildSceneForSpec(spec)));
  }

  it('ticks the bin edges, as numbers, in order', async () => {
    const {title, ticks} = await histogramAxis();
    expect(title).toBe('body_mass_g');
    const values = ticks.map(tick => Number(tick.text));
    expect(values.length).toBeGreaterThan(2);
    expect(values.every(Number.isFinite)).toBe(true);
    values.forEach((value, i) => i && expect(value).toBeGreaterThan(values[i - 1]));
    // The edges are cut from the data's own extent, so they run over it.
    expect(values[0]).toBeLessThanOrEqual(2700);
    expect(values[values.length - 1]).toBeGreaterThanOrEqual(6300);
  });

  /**
   * The rows whose value was blank collect in a container of their own, ahead
   * of the first bin. It holds no interval, so it has no place on the axis --
   * and its label would print as `undefined-undefined` if it took one.
   */
  it('leaves the blank-value bin off the axis', async () => {
    const {ticks} = await histogramAxis();
    expect(ticks.every(tick => tick.text.indexOf('undefined') < 0)).toBe(true);
  });
});

/**
 * A tick can only point at one place, so a level whose groups are in several
 * places at once gets labels on the containers instead. Titanic's mosaic is
 * the repeated case -- `sex` fills Y inside `pclass`, which also fills Y, so
 * each sex is a band in every class -- and `maxfill_aspect` is the packed one,
 * a grid of age bins with a `pclass` split inside each cell.
 */
describe('levels an axis cannot describe', () => {
  async function render(name: string, labels: boolean | Labels = true): Promise<string> {
    const base = ALL_SPECS.find(s => s.name === name)!.spec;
    const scene: Scene = buildSceneForSpec({...withoutDecorations(base), labels}, 300);
    return renderVegaHeadless(scene);
  }

  it('labels a level nested inside another that fills the same direction', async () => {
    const svg = await render('mosaic');
    expect(axes(svg).map(axis => axis.title)).toEqual(['pclass', 'survived']);
    // `sex` is left to the labels, one per band rather than one per axis tick,
    // and named by a title of its own so the bands are not just words.
    expect(new Set(labelTexts(svg))).toEqual(new Set(['female', 'male']));
    expect(labelTitles(svg)).toEqual(['sex']);
  });

  /**
   * The repeats are the same run of groups every time, so only the copy
   * against the edge the level is read from is named: the sexes are labelled
   * down the leftmost column, not in each of the two `survived` columns of
   * each of the three classes.
   */
  it('names a repeated level once, against the edge', async () => {
    const svg = await render('mosaic');
    const labels = Array.from(parseSvg(svg).querySelectorAll('g[class*="labelMarks"] text'));
    // At most one per band of that column -- fewer where a band is too thin to
    // hold a line of type.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.length).toBeLessThanOrEqual(6);

    // Clear of the marks on one side and of the axis for the level above it on
    // the other: the labels are in the gutter between them, which is what the
    // axis was pushed out to leave.
    const model = modelFromVegaSvg(svg);
    const leftmostMark = Math.min(...model.units.map(unit => unit.cx - unit.radius));
    const [pclass] = axes(svg).filter(axis => axis.title === 'pclass');
    labels.forEach(label => {
      expect(anchor(label).x).toBeLessThanOrEqual(leftmostMark);
      expect(anchor(label).x).toBeGreaterThan(pclass.origin.x);
    });
  });

  it('labels the cells of levels that pack their groups in both directions', async () => {
    const svg = await render('maxfill_aspect');
    expect(axes(svg)).toEqual([]);
    // One per cell of the packed grid, each naming the bin it holds.
    const binLabels = labelTexts(svg).filter(text => /^[\d.]+-[\d.]+$/.test(text));
    expect(binLabels.length).toBeGreaterThan(5);
    // Both levels are named: the cells are ages, the splits inside them are
    // classes. Without the titles the chart is a grid of unexplained numbers.
    expect(labelTitles(svg)).toEqual(['age', 'pclass']);
  });

  /**
   * Nothing in this chart shows where one facet ends: the level's own box is
   * drawn with no outline, and the gaps between its cells are the same as the
   * gaps inside them. So each heading carries a rule to the far edge of the
   * cell it heads, which is what makes the facets visible at all.
   */
  it('runs a rule from each heading to the end of the cell it heads', async () => {
    const svg = await render('maxfill_aspect');
    const doc = parseSvg(svg);
    const headings = doc.querySelectorAll('g.labelMarks1 text');
    const rules = doc.querySelectorAll('g.labelMarks1Rules line');
    expect(headings.length).toBeGreaterThan(5);
    expect(rules.length).toBe(headings.length);

    // Each rule starts past its own heading and ends further right again.
    Array.from(rules).forEach((rule, index) => {
      const heading = anchor(headings[index]);
      expect(anchor(rule).x).toBeGreaterThan(heading.x);
      expect(Number(rule.getAttribute('x2'))).toBeGreaterThan(0);
    });
  });

  /**
   * The engine stamps `id` on every row before layout, so a `groupby` on it is
   * a `flatten` written another way: one container per row, labelled with a row
   * number. Three of the titanic specs end that way, and one of them --
   * `titanic_spec3` -- has containers big enough that some of those numbers
   * would be drawn.
   */
  it('leaves out a level grouped by the row identifier', async () => {
    const svg = await render('titanic_spec3');
    expect(labelTexts(svg)).toEqual([]);
    expect(labelTitles(svg)).toEqual([]);
    expect(axes(svg).map(axis => axis.title)).toEqual(['Class', 'Sex']);
  });

  /**
   * Nothing thins a run of labels out the way `labelOverlap` thins an axis, so
   * a label needs room in its own container -- and a level is labelled only
   * where most of it has that room. Half the groups named and half not says
   * more about how the packing fell than about the data.
   */
  it('labels all of a level or none of it', async () => {
    // Asked for by name, over the whole dataset: a handful of the 2201 rows
    // have a container wide enough for their number and the rest do not, so
    // none of them are drawn.
    const base = ALL_SPECS.find(s => s.name === 'titanic_spec3')!.spec;
    const spec = {...withoutDecorations(base), labels: {layouts: ['layout3']}};
    expect(labelTexts(await renderVegaHeadless(buildSceneForSpec(spec)))).toEqual([]);

    // The same level, given containers it can fill: two rows have room for
    // their numbers, and both get them.
    const roomy: Spec = {
      ...spec,
      width: 300,
      height: 300,
      data: {values: [{id: 0, Class: 'First'}, {id: 1, Class: 'First'}]},
    };
    const texts = labelTexts(await renderVegaHeadless(buildSceneForSpec(roomy)));
    expect(texts.sort()).toEqual(['0', '1']);
  });
});

/**
 * Two axes read against the same edge are stacked: the deeper level next to
 * the marks, the coarser one beyond it. That is what `orient` produces when it
 * sends a chart's axes to one side -- a mosaic of islands across and species
 * up, read together along the bottom.
 */
describe('axes stacked on one side', () => {
  it('puts the deeper level closest to the plot', async () => {
    const base = ALL_SPECS.find(s => s.name === 'penguins_island_species_mosaic')!.spec;
    const scene: Scene = buildSceneForSpec({
      ...withoutDecorations(base),
      labels: {orient: 'bottom'},
    });
    const drawn = axes(await renderVegaHeadless(scene));

    const [island, species] = ['island', 'species'].map(field => drawn.find(a => a.title === field)!);
    expect(island).toBeTruthy();
    expect(species).toBeTruthy();
    // The deeper level sits against the plot and the shallower one below it,
    // clear of its text: a line of 10px type plus a title.
    expect(island.origin.y - species.origin.y).toBeGreaterThan(20);
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
    delete (spec.mark!.color as {key?: string}).key;
    const scene = buildSceneForSpec(spec);
    const vegaSpec = buildVegaSpec(scene.spec, scene.data) as Record<string, unknown>;
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
