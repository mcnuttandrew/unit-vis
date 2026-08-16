import {asRow, defaultSetting, min} from '@unit-vis/core';
import type {Container, Spec, Layout, Mark} from '@unit-vis/core';
import {scaleOrdinal} from 'd3-scale';
import {select} from 'd3-selection';
import type {BaseType, Selection} from 'd3-selection';
import * as schemes from 'd3-scale-chromatic';

/**
 * One level of `<g>` elements, each bound to the container it draws. Successive
 * levels have different parent element types, so the loop below re-labels its
 * selection rather than threading the parent through the type.
 */
type LevelSelection = Selection<SVGGElement, Container, BaseType, unknown>;

type SchemeName = NonNullable<Mark['color']['scheme']>;

/**
 * Every level but the deepest holds further containers, and this only ever
 * walks the levels a layout produced.
 */
function childrenOf(container: Container): Container[] {
  return container.contents as Container[];
}

function buildLeafContainersArr(container: Container, layout: Layout): Container[] {
  if (layout && layout.child !== 'EndOfLayout') {
    const leafs: Container[] = [];
    childrenOf(container).forEach(function(c) {
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
    return childrenOf(container);
  }
}

/** One shape per leaf container, so one per data row. */
function setMarksColor<GElement extends BaseType>(
  marks: Selection<GElement, Container, BaseType, unknown>,
  markPolicy: Mark,
): void {
  const palettes = schemes as unknown as Record<SchemeName, readonly string[]>;
  const color = scaleOrdinal(palettes[markPolicy.color.scheme || 'schemeCategory10']);
  if (markPolicy.color.type === 'categorical') {
    console.log('continue');
  } else {
    console.log('TODO');
  }
  marks.style('fill', d => {
    return color(String(asRow(d.contents[0])[markPolicy.color.key]));
  });
}

function calcRadiusIsolated(leafContainer: Container, markPolicy: Mark): number {
  const width = leafContainer.visualspace.width;
  const height = leafContainer.visualspace.height;

  if (markPolicy.size!.type === 'max') {
    return width > height ? height / 2.0 : width / 2.0;
  } else {
    // AM: HACK THIS 0 MIGHT BREAK THINGS
    return 0;
  }
}

function calcRadiusShared(
  rootContainer: Container,
  markPolicy: Mark,
  layoutList: {head: Layout},
): number {
  return min(buildLeafContainersArr(rootContainer, layoutList.head), d =>
    calcRadiusIsolated(d, markPolicy),
  )!;
}

function calcRadius(
  leafContainer: Container,
  rootContainer: Container,
  markPolicy: Mark,
  layoutList: {head: Layout},
): number {
  if (markPolicy.size!.isShared) {
    return calcRadiusShared(rootContainer, markPolicy, layoutList);
  } else {
    return calcRadiusIsolated(leafContainer, markPolicy);
  }
}

export function drawUnit(container: Container, spec: Spec, layoutList: {head: Layout}, divId: string): void {
  const layouts = spec.layouts;
  const markPolicy = spec.mark!;

  const svg = select('#' + divId)
    .append('svg')
    .attr('width', spec.width!)
    .attr('height', spec.height!);

  const rootGroup: LevelSelection = svg
    .selectAll('.root')
    .data([container])
    .enter()
    .append('g')
    .attr('class', 'root')
    .attr('transform', ({visualspace: {posX, posY}}) => `translate(${posX}, ${posY})`);

  let currentGroup = rootGroup;
  layouts.forEach(function(layout) {
    // The box each container is drawn in, with the level's own styling filled
    // in from the library defaults wherever the layout left it out.
    const box = {
      opacity: layout.box?.opacity ?? defaultSetting.layout.box.opacity,
      fill: layout.box?.fill ?? defaultSetting.layout.box.fill,
      stroke: layout.box?.stroke ?? defaultSetting.layout.box.stroke,
      'stroke-width': layout.box?.['stroke-width'] ?? defaultSetting.layout.box['stroke-width'],
    };

    const tempGroup: LevelSelection = currentGroup
      .selectAll('.' + layout.name)
      .data(function(d) {
        return childrenOf(d);
      })
      .enter()
      .append('g')
      .attr('class', layout.name!)
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
      .style('opacity', box.opacity)
      .style('fill', box.fill)
      .style('stroke', box.stroke)
      .style('stroke-width', box['stroke-width']);

    currentGroup = tempGroup;
  });

  if (markPolicy.shape === 'rect') {
    const marks = currentGroup
      .append('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', d => d.visualspace.width)
      .attr('height', d => d.visualspace.height)
      .style('fill', 'purple');
    setMarksColor(marks, markPolicy);
  } else {
    const marks = currentGroup
      .append('circle')
      .attr('cx', d => d.visualspace.width / 2)
      .attr('cy', d => d.visualspace.height / 2)
      .attr('r', d => calcRadius(d, container, markPolicy, layoutList))
      .style('fill', 'purple');
    setMarksColor(marks, markPolicy);
  }
}
