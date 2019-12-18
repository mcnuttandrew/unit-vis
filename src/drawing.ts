import {defaultSetting} from './constants';
import {min} from 'd3-array';
import {scaleOrdinal} from 'd3-scale';
import {select} from 'd3-selection';
import {schemeCategory10} from 'd3-scale-chromatic';
import {Container, Spec, Layout} from '../index.d';

export function drawUnit(
  container: Container,
  spec: Spec,
  layoutList: Layout[],
  divId: string,
) {
  var layouts = spec.layouts;
  var markPolicy = spec.mark;

  var svg = select('#' + divId)
    .append('svg')
    .attr('width', spec.width)
    .attr('height', spec.height);

  var rootGroup = svg
    .selectAll('.root')
    .data([container])
    .enter()
    .append('g')
    .attr('class', 'root')
    .attr(
      'transform',
      ({visualspace: {posX, posY}}) => `translate(${posX}, ${posY})`,
    );

  var currentGroup = rootGroup;
  layouts.forEach(function(layout) {
    var tempGroup = currentGroup
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
        if (
          layout.hasOwnProperty('box') &&
          layout.box.hasOwnProperty('opacity')
        ) {
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
        if (
          layout.hasOwnProperty('box') &&
          layout.box.hasOwnProperty('stroke')
        ) {
          return layout.box.stroke;
        } else {
          return defaultSetting.layout.box.stroke;
        }
      })
      .style('stroke-width', () => {
        if (
          layout.hasOwnProperty('box') &&
          layout.box.hasOwnProperty('stroke-width')
        ) {
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

  setMarksColor(marks, container, markPolicy, layoutList);
}

function setMarksColor(
  marks: any,
  rootContainer: Container,
  markPolicy: any,
  layoutList: any,
) {
  var leafContainersArr = buildLeafContainersArr(
    rootContainer,
    layoutList.head,
  );
  const color = scaleOrdinal(schemeCategory10);
  if (markPolicy.color.type === 'categorical') {
  } else {
    console.log('TODO');
  }
  if (markPolicy.color.key === 'survived_text') {
    color('YES');
    color('NO');
  }
  marks.style('fill', (d: any) => color(d.contents[0][markPolicy.color.key]));
}

function calcRadius(
  leafContainer: Container,
  rootContainer: Container,
  markPolicy: any,
  layoutList: any,
) {
  var radius;
  if (markPolicy.size.isShared) {
    radius = calcRadiusShared(
      leafContainer,
      rootContainer,
      markPolicy,
      layoutList,
    );
  } else {
    radius = calcRadiusIsolated(leafContainer, markPolicy);
  }
  return radius;
}

function calcRadiusIsolated(leafContainer: Container, markPolicy: any) {
  var width = leafContainer.visualspace.width;
  var height = leafContainer.visualspace.height;

  if (markPolicy.size.type === 'max') {
    return width > height ? height / 2.0 : width / 2.0;
  }
}

function calcRadiusShared(
  leafContainer: Container,
  rootContainer: Container,
  markPolicy: any,
  layoutList: any,
) {
  var leafContainersArr = buildLeafContainersArr(
    rootContainer,
    layoutList.head,
  );

  return min(leafContainersArr, d => calcRadiusIsolated(d, markPolicy));
}

function buildLeafContainersArr(container: Container, layout: Layout) {
  if (layout.child !== 'EndOfLayout') {
    const leafs: any[] = [];
    container.contents.forEach(function(c: any) {
      const childLayout = typeof layout === 'string' ? null : layout.child;
      if (!childLayout) {
        return;
      }
      var newLeaves = buildLeafContainersArr(c, childLayout as Layout);

      newLeaves.forEach(function(d) {
        leafs.push(d);
      });
    });
    return leafs;
  } else {
    return container.contents;
  }
}
