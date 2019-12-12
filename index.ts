import {applyDefault} from './src/defaults';
import * as d3 from 'd3';
import {buildRootContainer} from './src/container';
import {applyLayout, buildLayoutList} from './src/layout';
import {drawUnit} from './src/drawing';

interface Padding {
  top: number;
  left: number;
  right: number;
  bottom: number;
}
export interface UnitSpec {
  title?: string;
  data: {
    url?: string; //url
    values?: DataRow[];
  };
  layouts: Layout[];
  mark?: {
    color: {
      key: string;
      type: string;
    };
    shape?: string;
  };
  height?: number;
  width?: number;
  padding?: Padding;
}

export interface Layout {
  subgroup: {
    type: string;
    key?: string;
    numBin?: number;
    aspect_ratio?: number;
  };
  aspect_ratio?: string;
  parent?: string | Layout;
  child?: string | Layout;
  size?: {
    isShared?: boolean;
    type?: string;
    key?: string;
  };
  name?: string;
  box?: {
    opacity?: number;
    fill?: string;
    stroke?: string;
    'stroke-width'?: string;
  };
  type?: string;
  [x: string]: any;
  sizeSharingGroup?: any;
}

export interface DataRow {
  [x: string]: any;
}
export interface Container {
  contents: any[];
  label: string;
  visualspace: {
    width: number;
    height: number;
    posX: number;
    posY: number;
    padding: Padding;
  };
  layout: string | Layout;
  parent: string | Layout;
  [x: string]: any;
}

export interface EdgeInfo {
  remainingEdgeSideUnitLength: number;
  fillingEdgeSideUnitLength: number;
  fillingEdgeRepetitionCount: number;
}

export default function UnitChart(divId: string, spec: UnitSpec) {
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

function renderChart(data: DataRow[], spec: UnitSpec, divId: string) {
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
