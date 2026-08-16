/**
 * Drives both drawing backends against the same layout, inside jsdom, and hands
 * back the SVG each one produced.
 */
import {readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {csvParse} from 'd3-dsv';
import * as vega from 'vega';
import {applyDefault} from '../../library/defaults';
import {drawUnit} from '../../library/drawing';
import drawUnitVega, {buildVegaSpec} from '../../library/drawing-vega';
import {buildScene} from '../../library/index';
import type {Container, DataRow, Layout, Spec} from '../../library/index.d';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');

/**
 * Specs reference their data by url relative to the served root (`public/`).
 * In node we read it off disk and parse it exactly the way `d3-fetch` would at
 * runtime: csv fields stay strings, json rows keep the types they were written
 * with.
 */
export function loadSpecData(spec: Spec): DataRow[] {
  if (spec.data.values) {
    return spec.data.values.map(row => ({...row}));
  }
  if (!spec.data.url) {
    throw new Error('spec has neither data.values nor data.url');
  }
  const raw = readFileSync(join(REPO_ROOT, 'public', spec.data.url), 'utf8');
  return spec.data.url.endsWith('.json') ? (JSON.parse(raw) as DataRow[]) : (csvParse(raw) as DataRow[]);
}

export interface Scene {
  spec: Spec;
  data: DataRow[];
  rootContainer: Container;
  layoutList: {head: Layout};
}

/**
 * Run the shared front half of the pipeline: defaults, data load, layout. Both
 * backends draw from this one container tree, so any difference in their output
 * is a drawing difference rather than a layout difference.
 */
export function buildSceneForSpec(rawSpec: Spec, sampleSize?: number): Scene {
  const spec = JSON.parse(JSON.stringify(rawSpec)) as Spec;
  applyDefault(spec);
  let data = loadSpecData(spec);
  if (sampleSize && data.length > sampleSize) {
    data = data.slice(0, sampleSize);
  }
  const {rootContainer, layoutList} = buildScene(data, spec);
  return {spec, data, rootContainer, layoutList};
}

/** Fresh detached div so repeated renders never see each other's output. */
function makeTarget(id: string): HTMLElement {
  const existing = document.getElementById(id);
  if (existing) {
    existing.remove();
  }
  const div = document.createElement('div');
  div.id = id;
  document.body.appendChild(div);
  return div;
}

function serialize(target: HTMLElement): string {
  const svg = target.querySelector('svg');
  if (!svg) {
    throw new Error(`no svg was rendered into #${target.id}`);
  }
  return svg.outerHTML;
}

export function renderOld(scene: Scene, id = 'old-target'): string {
  const target = makeTarget(id);
  drawUnit(scene.rootContainer, scene.spec, scene.layoutList, id);
  return serialize(target);
}

/**
 * The real vega code path: `drawUnitVega` -> `vega-embed` -> svg renderer, all
 * against the jsdom document. This is what the browser actually runs.
 */
export async function renderVegaEmbedded(scene: Scene, id = 'vega-target'): Promise<string> {
  const target = makeTarget(id);
  await drawUnitVega(scene.rootContainer, scene.spec, id);
  return serialize(target);
}

/**
 * The same vega spec rendered headlessly. Equivalent markup to the embedded
 * path minus vega-embed's chrome, and it never touches the document — handy for
 * the geometry comparisons and much faster in bulk.
 */
export async function renderVegaHeadless(scene: Scene): Promise<string> {
  const vegaSpec = buildVegaSpec(scene.rootContainer, scene.spec);
  const view = new vega.View(vega.parse(vegaSpec as vega.Spec), {renderer: 'none'});
  try {
    return await view.toSVG();
  } finally {
    view.finalize();
  }
}

/** Warnings and errors vega logged while building the view. */
export async function collectVegaLogs(scene: Scene): Promise<{warnings: string[]; errors: string[]}> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const logger = {
    level: () => logger,
    error: (...args: unknown[]) => {
      errors.push(args.join(' '));
      return logger;
    },
    warn: (...args: unknown[]) => {
      warnings.push(args.join(' '));
      return logger;
    },
    info: () => logger,
    debug: () => logger,
  } as unknown as vega.LoggerInterface;

  const vegaSpec = buildVegaSpec(scene.rootContainer, scene.spec);
  const view = new vega.View(vega.parse(vegaSpec as vega.Spec), {renderer: 'none', logger});
  try {
    await view.runAsync();
  } catch (error) {
    errors.push(String(error));
  } finally {
    view.finalize();
  }
  return {warnings, errors};
}
