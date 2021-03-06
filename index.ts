import {applyDefault} from './src/defaults';
import {csv} from 'd3-fetch';
import {buildRootContainer} from './src/container';
import {applyLayout, buildLayoutList} from './src/layout';
import {drawUnit} from './src/drawing';
import {Spec, DataRow, Layout} from './index.d';

export const UnitChart = (divId: string, spec: Spec): void => {
  applyDefault(spec);
  if (!spec.data) {
    return;
  }
  if (spec.data.url) {
    csv(spec.data.url).then((csv_data: DataRow[]) => {
      renderChart(csv_data, spec, divId);
    });
  } else {
    renderChart(spec.data.values, spec, divId);
  }
};
export default UnitChart;

function renderChart(data: DataRow[], spec: Spec, divId: string): void {
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

  drawUnit(rootContainer, spec, layoutList as {head: Layout}, divId);
}
