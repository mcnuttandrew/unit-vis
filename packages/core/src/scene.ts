import {applyDefault} from './defaults.js';
import {buildRootContainer} from './container.js';
import {applyLayout, buildLayoutList} from './layout.js';
import {fetchData} from './data.js';
import type {Spec, DataRow, Layout, Container} from './types.js';

/**
 * The laid-out chart: a tree of boxes, plus the layout list that produced it.
 * This is the whole contract between the grammar and a renderer -- both the d3
 * and the vega backends draw from nothing else.
 */
export interface Scene {
  /** The canvas, holding the whole container tree beneath it. */
  rootContainer: Container;
  /** `spec.layouts` linked head-to-tail, as the engine leaves it. */
  layoutList: {head: Layout};
}

/**
 * Run the layout pipeline over data already in hand.
 *
 * Note that this mutates `spec` (filling in defaults happens in `loadScene`,
 * but the engine also links `spec.layouts` into a list and records each level's
 * containers on it) and stamps an `id` onto every row, so `id` is available as
 * a grouping key even for data that has no identifier of its own.
 */
export function buildScene(data: DataRow[], spec: Spec): Scene {
  data.forEach(function (d, i) {
    d.id = i;
  });
  const rootContainer = buildRootContainer(data, spec);
  const layoutList = buildLayoutList(spec.layouts);

  let childContainers = [rootContainer];
  let currentLayout: string | Layout | undefined = layoutList.head;

  while (currentLayout && currentLayout !== 'EndOfLayout') {
    childContainers = applyLayout(childContainers, currentLayout as Layout);
    currentLayout = currentLayout && (currentLayout as Layout).child;
  }
  return {rootContainer, layoutList: layoutList as {head: Layout}};
}

/**
 * Fill in the spec's defaults, resolve its data, and lay the chart out --
 * everything a renderer needs to do before it can draw. Resolves to `null` for
 * a spec with no `data` at all, which is the one case there is nothing to draw.
 */
export function loadScene(spec: Spec): Promise<Scene | null> {
  applyDefault(spec);
  if (!spec.data) {
    return Promise.resolve(null);
  }
  const rows = spec.data.url ? fetchData(spec.data.url) : Promise.resolve(spec.data.values ?? []);
  return rows.then(data => buildScene(data, spec));
}
