/**
 * `spec.title`: a heading for the chart, which the vega backend draws and the
 * old one has no counterpart for.
 *
 * A title is the third decoration, and it plays by the same rules as the other
 * two: it is drawn outside the plotting area, in room added around the canvas
 * rather than taken out of it, so the chart underneath is exactly the chart the
 * spec asked for. That is most of what is pinned here -- the text itself is one
 * assertion, and the rest is that adding it moved nothing.
 */
import {beforeAll, describe, expect, it} from 'vitest';
import {buildVegaSpec} from 'unit-vis-vega';
import type {Spec, Title} from '@unit-vis/core';
import {buildSceneForSpec, renderOld, renderVegaHeadless} from './harness/render';
import {modelFromOldSvg, modelFromVegaSvg, parseSvg, parseTransform} from './harness/svg-model';
import {ALL_SPECS, withoutDecorations} from './harness/specs';

const BASE = 'penguins_species_column';

/** The base spec with nothing on it but the title under test. */
function specWith(title?: string | Title): Spec {
  const base = withoutDecorations(ALL_SPECS.find(s => s.name === BASE)!.spec);
  return title === undefined ? base : {...base, title};
}

async function renderVega(title?: string | Title): Promise<string> {
  return renderVegaHeadless(buildSceneForSpec(specWith(title)));
}

/** The title block vega drew: its two lines of text, in order. */
function titleTexts(svg: string): string[] {
  return Array.from(parseSvg(svg).querySelectorAll('g.role-title text')).map(
    text => text.textContent || '',
  );
}

/**
 * Where the title block sits, relative to the plotting area: vega places the
 * block with a transform on the group and then writes each line inside it, so
 * this is the anchor the whole title hangs from. Negative is outside the plot,
 * which is where a top or left title goes.
 */
function titleOrigin(svg: string): {x: number; y: number} {
  const group = parseSvg(svg).querySelector('g.role-title > g');
  expect(group, 'no title was drawn').toBeTruthy();
  const {e, f} = parseTransform(group!.getAttribute('transform'));
  return {x: e, y: f};
}

/** The heading itself, the first of the block's lines. */
function headingText(svg: string): Element {
  const text = parseSvg(svg).querySelector('g.role-title-text text');
  expect(text, 'no title was drawn').toBeTruthy();
  return text!;
}

let plain: string;

beforeAll(async () => {
  plain = await renderVega();
}, 60000);

describe('by default', () => {
  it('draws no title, and a spec without one is the spec it always was', () => {
    const scene = buildSceneForSpec(specWith());
    const vegaSpec = buildVegaSpec(scene.spec, scene.data) as Record<string, unknown>;
    expect(vegaSpec.title).toBeUndefined();
    expect(vegaSpec.autosize).toEqual({type: 'none'});
    expect(titleTexts(plain)).toEqual([]);
  });

  it('draws nothing for a title with no text in it', async () => {
    expect(titleTexts(await renderVega(''))).toEqual([]);
    expect(titleTexts(await renderVega({text: ''}))).toEqual([]);
  });
});

describe('a string title', () => {
  it('is drawn above the chart', async () => {
    const svg = await renderVega('Palmer penguins');
    expect(titleTexts(svg)).toEqual(['Palmer penguins']);
  });

  it('says the same thing as the object form', async () => {
    const asString = titleTexts(await renderVega('Palmer penguins'));
    const asObject = titleTexts(await renderVega({text: 'Palmer penguins'}));
    expect(asObject).toEqual(asString);
  });
});

describe('an object title', () => {
  it('draws the subtitle under the heading, smaller and quieter', async () => {
    const svg = await renderVega({
      text: 'Penguins',
      subtitle: 'Palmer Station, Antarctica',
      fontSize: 20,
    });
    expect(titleTexts(svg)).toEqual(['Penguins', 'Palmer Station, Antarctica']);
    const subtitle = parseSvg(svg).querySelector('g.role-title-subtitle text')!;
    const heading = headingText(svg);
    expect(parseFloat(subtitle.getAttribute('font-size')!)).toBeLessThan(
      parseFloat(heading.getAttribute('font-size')!),
    );
    // Each line is placed inside the block by a transform of its own, and the
    // second one is further down it.
    expect(parseTransform(subtitle.getAttribute('transform')).f).toBeGreaterThan(
      parseTransform(heading.getAttribute('transform')).f,
    );
  });

  it('reads its anchor along the edge it sits on', async () => {
    const start = titleOrigin(await renderVega({text: 'Penguins', anchor: 'start'}));
    const middle = titleOrigin(await renderVega({text: 'Penguins', anchor: 'middle'}));
    const end = titleOrigin(await renderVega({text: 'Penguins', anchor: 'end'}));
    expect(start.x).toBeLessThan(middle.x);
    expect(middle.x).toBeLessThan(end.x);
  });

  it('sits on the side it was oriented to', async () => {
    const top = titleOrigin(await renderVega({text: 'Penguins', orient: 'top'}));
    const bottom = titleOrigin(await renderVega({text: 'Penguins', orient: 'bottom'}));
    const left = titleOrigin(await renderVega({text: 'Penguins', orient: 'left'}));
    // A top title hangs above the plot's own origin; a bottom one starts past
    // its far edge; a left one is off to the side of both.
    expect(top.y).toBeLessThan(0);
    expect(bottom.y).toBeGreaterThan(top.y);
    expect(left.x).toBeLessThan(0);
  });

  it('takes the type it was given', async () => {
    const svg = await renderVega({text: 'Penguins', fontSize: 24, color: '#aa0000'});
    expect(parseFloat(headingText(svg).getAttribute('font-size')!)).toBe(24);
    expect(headingText(svg).getAttribute('fill')).toBe('#aa0000');
  });
});

describe('the chart underneath', () => {
  it('is the same chart, moved down by the room the title took', async () => {
    const titled = modelFromVegaSvg(await renderVega({text: 'Penguins', subtitle: 'and their bills'}));
    const bare = modelFromVegaSvg(plain);
    expect(titled.units.length).toBe(bare.units.length);
    const shift = titled.units[0].cy - bare.units[0].cy;
    expect(shift, 'a title above the chart should have pushed it down').toBeGreaterThan(0);
    titled.units.forEach((unit, index) => {
      expect(unit.cx, `unit ${index}`).toBeCloseTo(bare.units[index].cx, 2);
      expect(unit.cy - shift, `unit ${index}`).toBeCloseTo(bare.units[index].cy, 2);
      expect(unit.radius, `unit ${index}`).toBeCloseTo(bare.units[index].radius, 2);
    });
  });

  it('grows the svg around itself rather than shrinking the plot', async () => {
    const titled = modelFromVegaSvg(await renderVega({text: 'Penguins'}));
    const bare = modelFromVegaSvg(plain);
    expect(titled.height).toBeGreaterThan(bare.height);
    expect(titled.width).toBe(bare.width);
  });
});

describe('the old backend', () => {
  it('renders a titled spec exactly as it renders an untitled one', () => {
    const titled = modelFromOldSvg(renderOld(buildSceneForSpec(specWith({text: 'Penguins'}))));
    const bare = modelFromOldSvg(renderOld(buildSceneForSpec(specWith())));
    expect(titled.width).toBe(bare.width);
    expect(titled.height).toBe(bare.height);
    expect(titled.units.map(u => [u.cx, u.cy, u.radius])).toEqual(
      bare.units.map(u => [u.cx, u.cy, u.radius]),
    );
  });
});
