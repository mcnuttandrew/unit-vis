import {applyDefault} from './src/defaults';
import * as d3 from 'd3';
import {buildRootContainer} from './src/container';
import {applyLayout, buildLayoutList} from './src/layout';
import {drawUnit} from './src/drawing';
import {Spec, DataRow} from './index.d';
export default function UnitChart(divId: string, spec: Spec) {
  applyDefault(spec);
  if (!spec.data) {
    return;
  }
  if (spec.data.url) {
    d3.csv(spec.data.url).then((csv_data: DataRow[]) => {
      renderChart(csv_data, spec, divId);
    });
  } else {
    renderChart(spec.data.values, spec, divId);
  }
}

function renderChart(data: DataRow[], spec: Spec, divId: string) {
  data.forEach(function(d, i) {
    d.id = i;
  });
  const rootContainer = buildRootContainer(data, spec);
  const layoutList = buildLayoutList(spec.layouts);

  let childContainers = [rootContainer];
  let currentLayout = layoutList.head;

  while (currentLayout !== 'EndOfLayout') {
    childContainers = applyLayout(childContainers, currentLayout);
    currentLayout = currentLayout.child;
  }

  drawUnit(rootContainer, spec, layoutList, divId);
}
