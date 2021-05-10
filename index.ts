import {applyDefault} from './src/defaults';
import {csv} from 'd3-fetch';
import {buildRootContainer} from './src/container';
import {applyLayout, buildLayoutList} from './src/layout';
import {drawUnit} from './src/drawing';
import drawUnitVega from './src/drawing-vega';
import {Spec, DataRow, Layout} from './index.d';

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
  (spec.data.url ? csv(spec.data.url) : Promise.resolve(spec.data.values)).then((data: DataRow[]) => {
    renderChart(data, spec, divId, options.backend);
  });
};
export default UnitChart;

function renderChart(data: DataRow[], spec: Spec, divId: string, backend: Backend): void {
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
  if (backend === 'old') {
    drawUnit(rootContainer, spec, layoutList as {head: Layout}, divId);
  } else {
    drawUnitVega(rootContainer, spec, layoutList as {head: Layout}, divId);
  }
}
