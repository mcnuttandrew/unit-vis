import embed from 'vega-embed';
import {Spec as VegaSpec} from 'vega-typings';
import {defaultSetting} from './constants';
import {min} from 'd3-array';

import {Container, Spec, Layout, Mark} from '../index.d';

const markMap = {
  circle: 'circle',
  rect: 'square',
};

interface RenderMark {
  type: 'mark';
  posX: number;
  posY: number;
  radius: number;
  color: string;
  data: any;
}

interface RenderContainer {
  type: 'container';
  posX: number;
  posY: number;
  height: number;
  width: number;
}
type Renderables = RenderContainer | RenderMark;

function calcRadiusIsolated(leafContainer: Container, markPolicy: any): number {
  const {width, height} = leafContainer.visualspace;
  return markPolicy.size.type === 'max' ? (width > height ? height / 2.0 : width / 2.0) : 0;
}

function buildLeafContainersArr(container: Container, layout: Layout): Container[] {
  if (layout && layout.child !== 'EndOfLayout') {
    return container.contents.reduce((leafs, c: Container) => {
      const childLayout = typeof layout === 'string' ? null : layout.child;
      return !childLayout ? leafs : leafs.concat(buildLeafContainersArr(c, childLayout as Layout));
    }, []);
  }
  return container.contents;
}

function calcRadiusShared(rootContainer: Container, markPolicy: Mark, layoutList: {head: Layout}): number {
  // return Math.min(
  //   ...buildLeafContainersArr(rootContainer, layoutList.head).map(d => calcRadiusIsolated(d, markPolicy)),
  // );
  return min(buildLeafContainersArr(rootContainer, layoutList.head), d => calcRadiusIsolated(d, markPolicy));
}

const radii = {} as any;
function bindCalcRadius(rootContainer: Container, markPolicy: Mark, layoutList: {head: Layout}) {
  return function calcRadius(leafContainer: Container): number {
    const radius = markPolicy.size.isShared
      ? calcRadiusShared(rootContainer, markPolicy, layoutList)
      : calcRadiusIsolated(leafContainer, markPolicy);
    radii[radius] = true;
    return radius;
  };
}

function getBoxStyle(layout: Layout, key: string): string | number {
  if (layout.hasOwnProperty('box') && layout.box.hasOwnProperty(key)) {
    return (layout as any).box[key];
  } else {
    return (defaultSetting.layout.box as any)[key];
  }
}

function recursiveExtractPositions(
  container: Container,
  markPolicy: Mark,
  calcRadius: (x: Container) => number,
  layoutList: Layout[],
  // root: Container,
): Renderables[] {
  const layout = layoutList[0];
  const {posX: containerXOffset, posY: containerYOffset, height, width} = container.visualspace;
  return container.contents
    .reduce(
      (acc: Renderables[], child) => {
        const hasChild = child.contents && child.contents.length >= 1 && child.contents[0].visualspace;
        if (hasChild) {
          return acc.concat(recursiveExtractPositions(child, markPolicy, calcRadius, layoutList.slice(1)));
        }
        const {posX, posY, width: childWidth} = child.visualspace;
        const data = child.contents[0];
        if (!data) {
          return acc;
        }

        // const radius = calcRadius(container, root, markPolicy, layoutList);
        const radius = calcRadius(container);
        const isCircle = markPolicy.shape === 'circle';
        return acc.concat({
          type: 'mark',
          posX: posX + (isCircle ? childWidth / 2 : 0),
          posY: posY + (isCircle ? childWidth / 2 : 0),
          color: data[markPolicy.color.key],
          data,
          radius: isCircle ? radius : childWidth,
        } as RenderMark);
      },
      [
        {
          type: 'container',
          posX: 0,
          posY: 0,
          height,
          width,
          opacity: getBoxStyle(layout, 'opacity'),
          fill: getBoxStyle(layout, 'fill'),
          stroke: getBoxStyle(layout, 'stroke'),
          'stroke-width': getBoxStyle(layout, 'stroke-width'),
        },
      ],
    )
    .map((child: Renderables) => ({
      ...child,
      posX: child.posX + containerXOffset,
      posY: child.posY + containerYOffset,
    }));
}

function groupBy<T>(data: T[], key: string): {[x: string]: T[]} {
  return data.reduce(
    (acc, row: any) => {
      acc[row[key]] = (acc[row[key]] || []).concat(row);
      return acc;
    },
    {} as any,
  );
}

export default function drawUnitVega(
  container: Container,
  spec: Spec,
  layoutList: {head: Layout},
  divId: string,
): void {
  const calcRadius = bindCalcRadius(container, spec.mark, layoutList);
  const positions = recursiveExtractPositions(container, spec.mark, calcRadius, spec.layouts);
  const {mark: markPositions, container: containerPositions} = groupBy<Renderables>(positions, 'type');
  const rootContainer = containerPositions[0] as RenderContainer;
  const newSpec: VegaSpec = {
    width: spec.width,
    height: spec.height,
    data: [
      {name: 'markPositions', values: markPositions},
      {name: 'containerPositions', values: containerPositions.slice(1)},
    ],
    scales: [
      {
        name: 'xscale',
        type: 'linear',
        domain: {data: 'markPositions', field: 'posX'},
        // not sure about this
        domainMin: rootContainer.posX,
        domainMax: rootContainer.posX + rootContainer.width,
        range: 'width',
      },
      {
        name: 'yscale',
        type: 'linear',
        domain: {data: 'markPositions', field: 'posY'},
        // not sure about this
        domainMin: rootContainer.posY,
        domainMax: rootContainer.posY + rootContainer.height,
        range: 'height',
        reverse: true,
      },
      {name: 'id', type: 'identity'},
      {
        name: 'radiusScale',
        type: 'identity',
      },
      {
        name: 'colorScale',
        type: 'ordinal',
        domain: {data: 'markPositions', field: 'color'},
        range: {scheme: spec.mark.color.scheme || 'category10'},
      },
    ],
    marks: [
      {
        type: 'rect',
        from: {data: 'containerPositions'},
        encode: {
          enter: {
            x: {scale: 'id', field: 'posX'},
            y: {scale: 'id', field: 'posY'},
            height: {scale: 'id', field: 'height'},
            width: {scale: 'id', field: 'width'},
            fill: {signal: 'datum["fill"]'},
            opacity: {signal: 'datum["opacity"]'},
            stroke: {signal: 'datum["stroke"]'},
            'stroke-width': {signal: 'datum["stroke-width"]'},
          },
        },
      },
      {
        type: 'symbol',
        from: {data: 'markPositions'},
        encode: {
          enter: {
            shape: {value: markMap[spec.mark.shape]},
            x: {scale: 'xscale', field: 'posX'},
            y: {scale: 'yscale', field: 'posY'},
            // size: {signal: '(3.1415 * 4 * sqrt(datum.radius))'},
            size: {signal: 'datum.radius * datum.radius'},
            fill: {scale: 'colorScale', field: 'color'},
            tooltip: {signal: 'datum.data'},
          },
        },
      },
    ],
  };
  embed(`#${divId}`, newSpec, {mode: 'vega', renderer: 'svg'});
  console.log(
    'new radii',
    Object.keys(radii)
      .map(x => Number(x))
      .sort((a, b) => (Number(a) > Number(b) ? 1 : -1)),
  );
}
