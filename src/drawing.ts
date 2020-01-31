import {defaultSetting} from './constants';
import {min} from 'd3-array';
import {scaleOrdinal} from 'd3-scale';
import {select} from 'd3-selection';
import {schemeCategory10} from 'd3-scale-chromatic';
import {Container, Spec, Layout} from '../index.d';

function buildLeafContainersArr(container: Container, layout: Layout): Container[] {
  if (layout && layout.child !== 'EndOfLayout') {
    const leafs: any[] = [];
    container.contents.forEach(function(c: any) {
      const childLayout = typeof layout === 'string' ? null : layout.child;
      if (!childLayout) {
        return;
      }
      const newLeaves = buildLeafContainersArr(c, childLayout as Layout);

      newLeaves.forEach(function(d) {
        leafs.push(d);
      });
    });
    return leafs;
  } else {
    return container.contents;
  }
}

function setMarksColor(marks: any, rootContainer: Container, markPolicy: any): void {
  // layoutList: any
  // const leafContainersArr = buildLeafContainersArr(rootContainer, layoutList.head);
  const color = scaleOrdinal(schemeCategory10);
  if (markPolicy.color.type === 'categorical') {
    console.log('continue');
  } else {
    console.log('TODO');
  }
  if (markPolicy.color.key === 'survived_text') {
    color('YES');
    color('NO');
  }
  marks.style('fill', (d: any) => color(d.contents[0][markPolicy.color.key]));
}

function calcRadiusIsolated(leafContainer: Container, markPolicy: any): number {
  const width = leafContainer.visualspace.width;
  const height = leafContainer.visualspace.height;

  if (markPolicy.size.type === 'max') {
    return width > height ? height / 2.0 : width / 2.0;
  } else {
    // AM: HACK THIS 0 MIGHT BREAK THINGS
    return 0;
  }
}

function calcRadiusShared(
  leafContainer: Container,
  rootContainer: Container,
  markPolicy: any,
  layoutList: any,
): number {
  const leafContainersArr = buildLeafContainersArr(rootContainer, layoutList.head);

  return min(leafContainersArr, d => calcRadiusIsolated(d, markPolicy));
}

function calcRadius(
  leafContainer: Container,
  rootContainer: Container,
  markPolicy: any,
  layoutList: any,
): number {
  if (markPolicy.size.isShared) {
    return calcRadiusShared(leafContainer, rootContainer, markPolicy, layoutList);
  } else {
    return calcRadiusIsolated(leafContainer, markPolicy);
  }
}

export function drawUnit(container: Container, spec: Spec, layoutList: any[], divId: string): void {
  const layouts = spec.layouts;
  const markPolicy = spec.mark;

  const svg = select('#' + divId)
    .append('svg')
    .attr('width', spec.width)
    .attr('height', spec.height);

  const rootGroup = svg
    .selectAll('.root')
    .data([container])
    .enter()
    .append('g')
    .attr('class', 'root')
    .attr('transform', ({visualspace: {posX, posY}}) => `translate(${posX}, ${posY})`);

  let currentGroup = rootGroup;
  layouts.forEach(function(layout) {
    const tempGroup = currentGroup
      .selectAll('.' + layout.name)
      .data(function(d) {
        return d.contents;
      })
      .enter()
      .append('g')
      .attr('class', layout.name)
      .attr('transform', ({visualspace: {posX, posY}}) => {
        if (isNaN(posX) || isNaN(posY)) {
          console.log('NaN happened');
          console.log(spec);
        }
        return `translate(${posX}, ${posY})`;
      });

    tempGroup
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', d => d.visualspace.width)
      .attr('height', d => d.visualspace.height)
      .style('opacity', () => {
        if (layout.hasOwnProperty('box') && layout.box.hasOwnProperty('opacity')) {
          return layout.box.opacity;
        } else {
          return defaultSetting.layout.box.opacity;
        }
      })
      .style('fill', () => {
        if (layout.hasOwnProperty('box') && layout.box.hasOwnProperty('fill')) {
          return layout.box.fill;
        } else {
          return defaultSetting.layout.box.fill;
        }
      })
      .style('stroke', () => {
        if (layout.hasOwnProperty('box') && layout.box.hasOwnProperty('stroke')) {
          return layout.box.stroke;
        } else {
          return defaultSetting.layout.box.stroke;
        }
      })
      .style('stroke-width', () => {
        if (layout.hasOwnProperty('box') && layout.box.hasOwnProperty('stroke-width')) {
          return layout.box['stroke-width'];
        } else {
          return defaultSetting.layout.box['stroke-width'];
        }
      });

    // @ts-ignore
    currentGroup = tempGroup;
  });

  let marks = null;
  switch (markPolicy.shape) {
    case 'circle':
      marks = currentGroup
        .append('circle')
        .attr('cx', d => d.visualspace.width / 2)
        .attr('cy', d => d.visualspace.height / 2)
        .attr('r', d => calcRadius(d, container, markPolicy, layoutList))
        .style('fill', 'purple');
      break;

    case 'rect':
      marks = currentGroup
        .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', d => d.visualspace.width)
        .attr('height', d => d.visualspace.height)
        .style('fill', 'purple');
      break;
    default:
      marks = currentGroup
        .append('circle')
        .attr('cx', d => d.visualspace.width / 2)
        .attr('cy', d => d.visualspace.height / 2)
        .attr('r', d => calcRadius(d, container, markPolicy, layoutList))
        .style('fill', 'purple');
      break;
  }

  setMarksColor(marks, container, markPolicy);
}
