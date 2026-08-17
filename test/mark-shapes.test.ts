/**
 * The four shapes that have to be told what to draw -- `emoji`, `text`, `path`
 * and `image` -- which only the vega backend draws.
 *
 * Three things are pinned here. That each shape draws what the spec asked for,
 * literal or read off the row. That all four land in the same box a circle
 * would have taken, so choosing a shape is a choice about appearance and never
 * about layout. And that a spec carrying one of them is still a spec the old
 * backend renders exactly as it did before.
 *
 * The rows are inline rather than one of the bundled datasets: the content
 * these shapes draw is per-row, so the tests need a handful of rows whose field
 * values they can name.
 */
import {beforeAll, describe, expect, it} from 'vitest';
import * as vega from 'vega';
import {buildVegaSpec} from 'unit-vis-vega';
import type {DataRow, Mark, Spec} from '@unit-vis/core';
import {boundingBox, samplePath, type Box} from './harness/path-geometry';
import {buildSceneForSpec, collectVegaLogs, renderOld, renderVegaHeadless} from './harness/render';
import {modelFromVegaSvg, parseSvg, parseTransform} from './harness/svg-model';
import {VEGA_ONLY_SPECS} from './harness/specs';

/**
 * jsdom will not fetch an image, so nothing ever fires `onload` and vega's
 * resource loader -- which every render waits on -- waits forever. This stands
 * in an image that reports itself loaded as soon as it is pointed somewhere,
 * which is all the renderer needs from it: the mark is drawn at the size the
 * encoding gives, and the url is copied onto the element as it stands.
 */
beforeAll(() => {
  class LoadedImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    crossOrigin: string | null = null;
    complete = false;
    width = 8;
    height = 8;
    private url = '';

    get src(): string {
      return this.url;
    }

    set src(value: string) {
      this.url = value;
      this.complete = true;
      queueMicrotask(() => this.onload && this.onload());
    }
  }
  (globalThis as {Image?: unknown}).Image = LoadedImage;
});

/** Three kinds, in runs of 3, 2 and 1, so a count-sized level makes them differ. */
const ROWS: DataRow[] = [
  {name: 'ada', kind: 'cat'},
  {name: 'grace', kind: 'cat'},
  {name: 'alan', kind: 'cat'},
  {name: 'edsger', kind: 'dog'},
  {name: 'barbara', kind: 'dog'},
  {name: 'donald', kind: 'bird'},
];

/** An 8x8 red square, so an image mark needs nothing off the network. */
const RED =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4' +
  'IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9InJlZCIvPjwvc3ZnPg==';
const BLUE = RED.replace('cmVk', 'Ymx1ZQ');

/** A triangle in the (-1, -1) to (1, 1) box a `path` mark is read in. */
const TRIANGLE = 'M0,-1L1,1L-1,1Z';
const BAR = 'M-1,-0.5L1,-0.5L1,0.5L-1,0.5Z';

/**
 * One flatten level over the rows, so there is one container -- and so one unit
 * mark -- per row. Sorting on `id` is what makes the marks come out in row
 * order, which is what lets a test name the content each one should carry.
 */
function specWith(mark: Partial<Mark>): Spec {
  return {
    data: {values: ROWS},
    width: 300,
    height: 100,
    layouts: [
      {
        name: 'people',
        subgroup: {type: 'flatten'},
        aspect_ratio: 'maxfill',
        // Each container measured against its own parent. With one parent that
        // is what the shared default does anyway; with a level above it, it is
        // what lets the containers come out at different sizes.
        size: {type: 'uniform', isShared: false},
        sort: {key: 'id', type: 'numerical', direction: 'ascending'},
      },
    ],
    mark: {color: {key: 'kind', type: 'categorical'}, ...mark} as Mark,
  };
}

async function render(mark: Partial<Mark>): Promise<string> {
  return renderVegaHeadless(buildSceneForSpec(specWith(mark)));
}

/**
 * The same rows split by kind first, in bars sized by how many rows each holds.
 * The runs are uneven, so the containers -- and so the marks in them -- come out
 * at different sizes, which is what the shared size policy has to flatten.
 */
function groupedSpecWith(mark: Partial<Mark>): Spec {
  const spec = specWith(mark);
  return {
    ...spec,
    layouts: [
      {
        name: 'kinds',
        subgroup: {type: 'groupby', key: 'kind'},
        aspect_ratio: 'fillX',
        size: {type: 'count', isShared: true},
      },
      ...spec.layouts,
    ],
  };
}

/** The elements one named mark drew, in document order. */
function drawn(svg: string, name: string): Element[] {
  return Array.from(parseSvg(svg).querySelectorAll(`g.${name} > *`));
}

const texts = (svg: string, name: string): string[] =>
  drawn(svg, name).map(el => el.textContent || '');

/** Where vega put an element, from the transform it positions marks with. */
function at(el: Element): {x: number; y: number} {
  const {e, f} = parseTransform(el.getAttribute('transform'));
  return {x: e, y: f};
}

/** The absolute bounding box of a path element vega positioned by transform. */
function pathBox(el: Element): Box {
  const box = boundingBox(samplePath(el.getAttribute('d') || ''));
  if (!box) {
    throw new Error('mark drew an empty path');
  }
  const {x, y} = at(el);
  return {...box, x: box.x + x, y: box.y + y};
}

const fontSizes = (svg: string, name: string): number[] =>
  drawn(svg, name).map(el => Number.parseFloat(el.getAttribute('font-size') || ''));

/**
 * The circles the same spec draws, which is the box every one of these shapes
 * is supposed to fit into.
 */
async function circles(): Promise<{cx: number; cy: number; radius: number}[]> {
  const model = modelFromVegaSvg(await render({shape: 'circle'}));
  return model.units.map(({cx, cy, radius}) => ({cx, cy, radius}));
}

describe('emoji marks', () => {
  it('draws the glyph it was given, once per unit', async () => {
    expect(texts(await render({shape: 'emoji', emoji: '🐧'}), 'unitEmojiMarks')).toEqual(
      ROWS.map(() => '🐧'),
    );
  });

  it('pairs a domain of field values with a range of glyphs', async () => {
    const svg = await render({
      shape: 'emoji',
      emoji: {key: 'kind', domain: ['cat', 'dog'], range: ['🐱', '🐶'], default: '❓'},
    });
    expect(texts(svg, 'unitEmojiMarks')).toEqual(['🐱', '🐱', '🐱', '🐶', '🐶', '❓']);
  });

  /** No `default` is a deliberate blank rather than a fallback to the value. */
  it('draws nothing for a value outside the domain that no default covers', async () => {
    const svg = await render({shape: 'emoji', emoji: {key: 'kind', domain: ['cat'], range: ['🐱']}});
    expect(texts(svg, 'unitEmojiMarks')).toEqual(['🐱', '🐱', '🐱', '', '', '']);
  });

  /**
   * No domain: the values take range entries in the order they first appear,
   * and the range repeats once it runs short -- which is what an ordinal scale
   * does, and the reason this is one rather than a lookup table.
   */
  it('hands a range out in first-seen order, repeating when it runs short', async () => {
    const svg = await render({shape: 'emoji', emoji: {key: 'kind', range: ['🐱', '🐶']}});
    expect(texts(svg, 'unitEmojiMarks')).toEqual(['🐱', '🐱', '🐱', '🐶', '🐶', '🐱']);
  });

  /**
   * Whether a glyph draws at all comes down to the font it is asked for, and
   * `sans-serif` has no emoji on every platform.
   */
  it('names an emoji font ahead of the platform default', async () => {
    const mark = drawn(await render({shape: 'emoji', emoji: '🐧'}), 'unitEmojiMarks')[0];
    expect(mark.getAttribute('font-family')).toContain('Emoji');
  });

  it('sizes the glyph to the container by default', async () => {
    const svg = await render({shape: 'emoji', emoji: '🐧'});
    const expected = (await circles()).map(circle => 2 * circle.radius);
    fontSizes(svg, 'unitEmojiMarks').forEach((size, i) => {
      expect(size).toBeCloseTo(expected[i], 3);
    });
  });

  it('takes the font size it is given', async () => {
    const svg = await render({shape: 'emoji', emoji: '🐧', fontSize: 7});
    expect(fontSizes(svg, 'unitEmojiMarks')).toEqual(ROWS.map(() => 7));
  });

  /**
   * An emoji is already colored, and painting over it would only show up where
   * the platform's emoji font happens to be monochrome.
   */
  it('leaves the glyph its own colors', async () => {
    const marks = drawn(await render({shape: 'emoji', emoji: '🐧'}), 'unitEmojiMarks');
    const fills = new Set(marks.map(el => el.getAttribute('fill')));
    expect(fills.size).toBe(1);
  });
});

describe('text marks', () => {
  it('draws a field off each row', async () => {
    expect(texts(await render({shape: 'text', text: {key: 'name'}}), 'unitTextMarks')).toEqual(
      ROWS.map(row => row.name),
    );
  });

  it('draws a literal on every unit', async () => {
    expect(texts(await render({shape: 'text', text: 'hi'}), 'unitTextMarks')).toEqual(
      ROWS.map(() => 'hi'),
    );
  });

  /**
   * The default size is whatever keeps the string inside its container, so a
   * longer string is set smaller -- and nothing is set taller than the
   * container, which is the size an emoji or a circle would have taken.
   */
  it('shrinks the type to fit the string in its container', async () => {
    const svg = await render({shape: 'text', text: {key: 'name'}});
    const sizes = fontSizes(svg, 'unitTextMarks');
    const heights = (await circles()).map(circle => 2 * circle.radius);
    const byRow = Object.fromEntries(ROWS.map((row, i) => [row.name as string, sizes[i]]));

    expect(byRow.ada).toBeGreaterThan(byRow.barbara);
    expect(byRow.ada).toBeGreaterThan(byRow.edsger);
    sizes.forEach((size, i) => {
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(heights[i] + 1e-9);
    });
  });

  /** The mapped string is what has to fit, not the value it was mapped from. */
  it('fits the type to the string it draws, not the value it read', async () => {
    const svg = await render({
      shape: 'text',
      text: {key: 'kind', domain: ['cat', 'dog', 'bird'], range: ['a', 'a lengthy label', 'b']},
    });
    const sizes = fontSizes(svg, 'unitTextMarks');
    expect(sizes[3]).toBeLessThan(sizes[0]);
    expect(sizes[0]).toBe(sizes[5]);
  });

  it('takes the font size it is given, fit or not', async () => {
    const svg = await render({shape: 'text', text: {key: 'name'}, fontSize: 30});
    expect(fontSizes(svg, 'unitTextMarks')).toEqual(ROWS.map(() => 30));
  });

  it('colors the text by the color key', async () => {
    const marks = drawn(await render({shape: 'text', text: {key: 'name'}}), 'unitTextMarks');
    const fills = marks.map(el => el.getAttribute('fill'));
    expect(new Set(fills).size).toBe(3);
    expect(fills[0]).toBe(fills[1]);
    expect(fills[0]).not.toBe(fills[3]);
  });
});

describe('path marks', () => {
  it('draws the path it was given, scaled to the container', async () => {
    const marks = drawn(await render({shape: 'path', path: TRIANGLE}), 'unitPathMarks');
    const expected = await circles();
    expect(marks.length).toBe(ROWS.length);
    marks.forEach((mark, i) => {
      const box = pathBox(mark);
      expect(box.width).toBeCloseTo(2 * expected[i].radius, 3);
      expect(box.height).toBeCloseTo(2 * expected[i].radius, 3);
    });
  });

  it('pairs a domain of field values with a range of paths', async () => {
    const svg = await render({
      shape: 'path',
      path: {key: 'kind', domain: ['cat', 'dog'], range: [TRIANGLE, BAR], default: TRIANGLE},
    });
    const shapes = drawn(svg, 'unitPathMarks').map(el => el.getAttribute('d'));
    expect(shapes[0]).toBe(shapes[1]);
    expect(shapes[0]).not.toBe(shapes[3]);
    // The bar is drawn half as tall as the box it is read in, and comes out
    // half as tall as the triangle that fills it.
    expect(pathBox(drawn(svg, 'unitPathMarks')[3]).height).toBeCloseTo(
      pathBox(drawn(svg, 'unitPathMarks')[0]).height / 2,
      3,
    );
  });

  it('colors the path by the color key', async () => {
    const marks = drawn(await render({shape: 'path', path: TRIANGLE}), 'unitPathMarks');
    const fills = marks.map(el => el.getAttribute('fill'));
    expect(new Set(fills).size).toBe(3);
    expect(fills[0]).toBe(fills[1]);
  });
});

describe('image marks', () => {
  it('points every unit at the picture it was given', async () => {
    const marks = drawn(await render({shape: 'image', image: RED}), 'unitImageMarks');
    expect(marks.length).toBe(ROWS.length);
    marks.forEach(mark => {
      expect(mark.getAttribute('xlink:href') || mark.getAttribute('href')).toBe(RED);
    });
  });

  it('pairs a domain of field values with a range of pictures', async () => {
    const svg = await render({
      shape: 'image',
      image: {key: 'kind', domain: ['cat', 'dog'], range: [RED, BLUE], default: RED},
    });
    const urls = drawn(svg, 'unitImageMarks').map(
      el => el.getAttribute('xlink:href') || el.getAttribute('href'),
    );
    expect(urls).toEqual([RED, RED, RED, BLUE, BLUE, RED]);
  });

  /** Fit inside the container, aspect ratio kept rather than stretched. */
  it('fits the picture in the container without distorting it', async () => {
    const marks = drawn(await render({shape: 'image', image: RED}), 'unitImageMarks');
    const expected = await circles();
    marks.forEach((mark, i) => {
      expect(Number(mark.getAttribute('width'))).toBeCloseTo(2 * expected[i].radius, 3);
      expect(Number(mark.getAttribute('height'))).toBeCloseTo(2 * expected[i].radius, 3);
      expect(mark.getAttribute('preserveAspectRatio')).toBe('xMidYMid');
    });
  });
});

/**
 * The shapes differ in what they draw and in nothing else: same container, same
 * center, same size policy, same tooltip.
 */
describe('every shape', () => {
  const CASES: {
    shape: string;
    mark: Partial<Mark>;
    markName: string;
    /**
     * The same shape told to draw something of a fixed length, so that what it
     * measures is its container and nothing else. Only `text` differs: its
     * default size fits the string as well as the box, and reading a field
     * would leave the string length in the measurement.
     */
    sized?: Partial<Mark>;
  }[] = [
    {shape: 'emoji', mark: {shape: 'emoji', emoji: '🐧'}, markName: 'unitEmojiMarks'},
    {
      shape: 'text',
      mark: {shape: 'text', text: {key: 'name'}},
      markName: 'unitTextMarks',
      sized: {shape: 'text', text: 'ab'},
    },
    {shape: 'path', mark: {shape: 'path', path: TRIANGLE}, markName: 'unitPathMarks'},
    {shape: 'image', mark: {shape: 'image', image: RED}, markName: 'unitImageMarks'},
  ];

  it.each(CASES)('$shape: draws one mark per row and nothing else', async ({mark, markName}) => {
    const svg = await render(mark);
    expect(drawn(svg, markName).length).toBe(ROWS.length);
    // The shape in play is the only one with any units in it.
    expect(drawn(svg, 'unitMarks').length).toBe(0);
    expect(drawn(svg, 'unitArcMarks').length).toBe(0);
  });

  it.each(CASES)('$shape: sits where the circle sat', async ({mark, markName}) => {
    const svg = await render(mark);
    const expected = await circles();
    drawn(svg, markName).forEach((el, i) => {
      const {cx, cy} = expected[i];
      if (el.tagName.toLowerCase() === 'image') {
        const {x, y} = at(el);
        expect(x + Number(el.getAttribute('width')) / 2).toBeCloseTo(cx, 3);
        expect(y + Number(el.getAttribute('height')) / 2).toBeCloseTo(cy, 3);
        return;
      }
      if (el.tagName.toLowerCase() === 'path') {
        const box = pathBox(el);
        expect(box.x + box.width / 2).toBeCloseTo(cx, 3);
        expect(box.y + box.height / 2).toBeCloseTo(cy, 3);
        return;
      }
      // Text is anchored on its own baseline, so it is centered horizontally
      // and within half a line of center vertically.
      const {x, y} = at(el);
      const size = Number.parseFloat(el.getAttribute('font-size') || '0');
      expect(x).toBeCloseTo(cx, 3);
      expect(Math.abs(y - cy)).toBeLessThanOrEqual(size / 2);
    });
  });

  /**
   * `mark.size` reaches every one of these shapes, because they are all drawn
   * off the same `radius` the circle mark reads: unshared, each is measured
   * against its own container; shared, all of them are drawn at the smallest of
   * those, so mark size never encodes anything accidentally.
   */
  it.each(CASES)('$shape: honors the shared mark-size policy', async ({mark, markName, sized}) => {
    const sizeOf = async (isShared: boolean): Promise<number[]> => {
      const spec = groupedSpecWith({...(sized ?? mark), size: {type: 'max', isShared}});
      const svg = await renderVegaHeadless(buildSceneForSpec(spec));
      return drawn(svg, markName).map(el =>
        el.tagName.toLowerCase() === 'text'
          ? Number.parseFloat(el.getAttribute('font-size') || '0')
          : el.tagName.toLowerCase() === 'image'
            ? Number(el.getAttribute('width'))
            : pathBox(el).width,
      );
    };

    const isolated = await sizeOf(false);
    const shared = await sizeOf(true);
    const distinct = (sizes: number[]): number =>
      new Set(sizes.map(size => size.toFixed(6))).size;

    expect(shared.length).toBe(ROWS.length);
    // The uneven runs give the containers different sizes to start with.
    expect(distinct(isolated)).toBeGreaterThan(1);
    expect(distinct(shared)).toBe(1);
    expect(shared[0]).toBeCloseTo(Math.min(...isolated), 6);
  });

  it.each(CASES)('$shape: carries the row as a tooltip', ({mark, markName}) => {
    const scene = buildSceneForSpec(specWith(mark));
    const marks = buildVegaSpec(scene.spec, scene.data).marks as {
      name: string;
      encode?: {update?: {tooltip?: {signal?: string}}};
    }[];
    const found = marks.find(m => m.name === markName);
    expect(found?.encode?.update?.tooltip).toEqual({signal: 'datum.row'});
  });

  it.each(CASES)('$shape: draws without vega complaining', async ({mark}) => {
    const logs = await collectVegaLogs(buildSceneForSpec(specWith(mark)));
    expect(logs.errors).toEqual([]);
    expect(logs.warnings).toEqual([]);
  });
});

/**
 * Shape is an encoding-time decision rather than a spec-construction-time one:
 * every shape the spec said what to draw for is compiled in, and `markShape`
 * picks between them at run time.
 */
describe('the compiled spec', () => {
  it('adds a mark only for the shapes the spec said what to draw for', () => {
    const names = (mark: Partial<Mark>): string[] => {
      const scene = buildSceneForSpec(specWith(mark));
      return (buildVegaSpec(scene.spec, scene.data).marks as {name: string}[]).map(m => m.name);
    };

    expect(names({shape: 'circle'})).toEqual(['containerMarks', 'unitMarks', 'unitArcMarks']);
    expect(names({shape: 'emoji', emoji: '🐧'})).toEqual([
      'containerMarks',
      'unitMarks',
      'unitArcMarks',
      'unitEmojiMarks',
    ]);
    expect(names({shape: 'circle', emoji: '🐧', text: {key: 'name'}})).toEqual([
      'containerMarks',
      'unitMarks',
      'unitArcMarks',
      'unitEmojiMarks',
      'unitTextMarks',
    ]);
  });

  it('reshapes a live view when `markShape` changes', async () => {
    const scene = buildSceneForSpec(specWith({shape: 'circle', emoji: '🐧'}));
    const view = new vega.View(vega.parse(buildVegaSpec(scene.spec, scene.data) as vega.Spec), {
      renderer: 'none',
    });
    try {
      await view.runAsync();
      expect(texts(await view.toSVG(), 'unitEmojiMarks')).toEqual([]);
      await view.signal('markShape', 'emoji').runAsync();
      expect(texts(await view.toSVG(), 'unitEmojiMarks')).toEqual(ROWS.map(() => '🐧'));
    } finally {
      view.finalize();
    }
  });

  it('compiles a range into an ordinal scale, and re-points it at run time', async () => {
    const scene = buildSceneForSpec(
      specWith({
        shape: 'emoji',
        emoji: {key: 'kind', domain: ['cat', 'dog'], range: ['🐱', '🐶'], default: '❓'},
      }),
    );
    const vegaSpec = buildVegaSpec(scene.spec, scene.data);
    expect((vegaSpec.scales as {name: string}[]).map(scale => scale.name)).toContain('emojiScale');

    const view = new vega.View(vega.parse(vegaSpec as vega.Spec), {renderer: 'none'});
    try {
      await view.runAsync();
      expect(texts(await view.toSVG(), 'unitEmojiMarks')[0]).toBe('🐱');
      await view.signal('emojiRange', ['🦊', '🐺']).runAsync();
      expect(texts(await view.toSVG(), 'unitEmojiMarks')[0]).toBe('🦊');
    } finally {
      view.finalize();
    }
  });

  it('adds no scale for content that is drawn as it stands', () => {
    const scene = buildSceneForSpec(specWith({shape: 'text', text: {key: 'name'}}));
    const scales = buildVegaSpec(scene.spec, scene.data).scales as {name: string}[];
    expect(scales.map(scale => scale.name)).toEqual(['xscale', 'yscale', 'colorScale']);
  });

  /** A shape nobody told what to draw has nothing to draw, so it falls back. */
  it('falls back to circles for a shape with no content', async () => {
    const svg = await render({shape: 'emoji'});
    expect(drawn(svg, 'unitArcMarks').length).toBe(ROWS.length);
  });
});

/**
 * The example specs that ship with the playground and use these shapes. They
 * are out of the parity and quality corpora by construction -- the d3 backend
 * draws circles for all four, so there is nothing there to compare against --
 * which leaves this as the only thing standing between them and quietly
 * rotting.
 */
describe('the bundled specs', () => {
  const SAMPLE_SIZE = 80;
  const CONTENT_ATTR: {[shape: string]: (el: Element) => string} = {
    emoji: el => el.textContent || '',
    text: el => el.textContent || '',
    path: el => el.getAttribute('d') || '',
    image: el => el.getAttribute('xlink:href') || el.getAttribute('href') || '',
  };

  it('covers every shape', () => {
    expect(VEGA_ONLY_SPECS.length).toBeGreaterThan(0);
    expect(new Set(VEGA_ONLY_SPECS.map(s => s.spec.mark!.shape))).toEqual(
      new Set(['emoji', 'text', 'path', 'image']),
    );
  });

  it.each(VEGA_ONLY_SPECS.map(s => s.name))('%s draws one mark per row', async name => {
    const {spec} = VEGA_ONLY_SPECS.find(s => s.name === name)!;
    const shape = spec.mark!.shape!;
    const scene = buildSceneForSpec(spec, SAMPLE_SIZE);
    const marks = drawn(
      await renderVegaHeadless(scene),
      `unit${shape[0].toUpperCase()}${shape.slice(1)}Marks`,
    );

    expect(marks.length).toBe(scene.data.length);
    // Every one of them was told what to draw: no row fell through a map with
    // no default, which is how a spec's content mapping goes stale unnoticed.
    marks.forEach(mark => expect(CONTENT_ATTR[shape](mark)).not.toBe(''));
  });

  it.each(VEGA_ONLY_SPECS.map(s => s.name))('%s draws without vega complaining', async name => {
    const {spec} = VEGA_ONLY_SPECS.find(s => s.name === name)!;
    const logs = await collectVegaLogs(buildSceneForSpec(spec, SAMPLE_SIZE));
    expect(logs.errors).toEqual([]);
    expect(logs.warnings).toEqual([]);
  });
});

describe('the old backend', () => {
  it('renders a spec asking for a new shape exactly as it renders a circle one', () => {
    const plain = renderOld(buildSceneForSpec(specWith({shape: 'circle'})), 'old-circle');
    const shaped = renderOld(
      buildSceneForSpec(specWith({shape: 'emoji', emoji: '🐧', fontSize: 12})),
      'old-emoji',
    );
    expect(shaped).toBe(plain);
  });
});
