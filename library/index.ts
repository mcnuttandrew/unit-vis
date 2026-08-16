import {applyDefault} from './defaults';
import {csv, json} from 'd3-fetch';
import {buildRootContainer} from './container';
import {applyLayout, buildLayoutList} from './layout';
import {drawUnit} from './drawing';
import drawUnitVega from './drawing-vega';
import {Spec, DataRow, Layout, Container} from './index.d';

type Backend = 'old' | 'vega';
interface Options {
  backend: Backend;
}

const defaultOptions: Options = {
  backend: 'old',
};

export const UnitChart = (divId: string, spec: Spec, options: Options = defaultOptions): void => {
  applyDefault(spec);
  if (!spec.data) {
    return;
  }
  (spec.data.url ? fetchData(spec.data.url) : Promise.resolve(spec.data.values)).then((data: DataRow[]) => {
    renderChart(data, spec, divId, options.backend);
  });
};
export default UnitChart;

/**
 * `data.url` may point at a csv or at a json array of rows. Csv fields arrive
 * as strings and json fields keep whatever type they were written with; the
 * layout engine coerces with `Number` where it needs a number, so both work.
 */
function fetchData(url: string): Promise<DataRow[]> {
  return url.endsWith('.json') ? (json(url) as Promise<DataRow[]>) : csv(url);
}

/**
 * Run the layout pipeline, producing the container tree that both drawing
 * backends consume. Exported so that tests can drive the backends directly.
 */
export function buildScene(data: DataRow[], spec: Spec): {rootContainer: Container; layoutList: {head: Layout}} {
  data.forEach(function(d, i) {
    d.id = i;
  });
  const rootContainer = buildRootContainer(data, spec);
  const layoutList = buildLayoutList(spec.layouts);

  let childContainers = [rootContainer];
  let currentLayout = layoutList.head;

  while (currentLayout && currentLayout !== 'EndOfLayout') {
    childContainers = applyLayout(childContainers, currentLayout as Layout);
    currentLayout = currentLayout && (currentLayout as Layout).child;
  }
  return {rootContainer, layoutList: layoutList as {head: Layout}};
}

function renderChart(data: DataRow[], spec: Spec, divId: string, backend: Backend): void {
  const {rootContainer, layoutList} = buildScene(data, spec);
  if (backend === 'old') {
    drawUnit(rootContainer, spec, layoutList, divId);
  } else {
    // The vega backend derives everything it needs from the container tree.
    drawUnitVega(rootContainer, spec, divId);
  }
}
