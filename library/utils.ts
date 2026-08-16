import {range, sum} from 'd3-array';
import {Layout, Container, EdgeInfo, Direction} from '../index.d';

export function isVerticalDirection(direction: Direction): boolean {
  switch (direction) {
    case 'LRBT':
    case 'LRTB':
    case 'RLBT':
    case 'RLTB':
      return true;
    case 'BTLR':
    case 'BTRL':
    case 'TBLR':
      return false;
  }
}

export function getKeys(data: any, groupby: string): string[] {
  return Object.keys(
    data.reduce((acc: any, row: any) => {
      acc[row[groupby]] = true;
      return acc;
    }, {}),
  );
}

export function emptyContainersFromKeys(data: any, groupby: string): Container[] {
  return getKeys(data, groupby).map(function(key) {
    return {
      contents: [],
      label: key,
      //   TODO this may break everything
      visualspace: {
        width: 0,
        height: 0,
        posX: 0,
        posY: 0,
        padding: {left: 0, right: 0, top: 0, bottom: 9},
      },
      layout: null,
      parent: null,
    };
  });
}

export function getCombination(n: number): {a: number; b: number}[] {
  return range(1, n + 1).map(a => ({a, b: Math.ceil(n / a)}));
  // const combi = range(1, n + 1);

  // return combi.map(function(d) {
  //   return {
  //     a: d,
  //     b: Math.ceil(n / d),
  //   };
  // });
}

export function getValue(container: Container, layout: Layout): number {
  switch (layout.size.type) {
    case 'uniform':
      return 1;
    case 'sum':
      return sum(container.contents, function(d) {
        return d[layout.size.key];
      });
    case 'count':
      return container.contents.length;
  }
}
export function getUnit(availableSpace: number, childContainers: Container[], layout: Layout): number {
  return availableSpace / sum(childContainers, d => getValue(d, layout));
}

export function isContainer(container: Container): boolean {
  if (
    container.hasOwnProperty('contents') &&
    container.hasOwnProperty('visualspace') &&
    container.hasOwnProperty('parent')
  ) {
    return true;
  }
  return false;
}

export function getParents(containers: Container[] = []): Container[] {
  const mySet = new Set();
  containers.forEach(d => mySet.add(d.parent));
  return Array.from(mySet) as Container[];
}

function applyEdgeInfoHorizontalDirection(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
): void {
  let xInc: number = null;
  let yInc: number = null;
  let numVerticalElement: number = null;
  let xOrig: number = null;
  let yOrig: number = null;
  switch (layout.direction) {
    case 'TBLR':
      xOrig = 0;
      yOrig = 0;
      xInc = edgeInfo.remainingEdgeSideUnitLength;
      yInc = edgeInfo.fillingEdgeSideUnitLength;
      numVerticalElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case 'BTLR':
      xOrig = 0;
      yOrig = parentContainer.visualspace.height - edgeInfo.remainingEdgeSideUnitLength;
      xInc = edgeInfo.remainingEdgeSideUnitLength;
      yInc = -1.0 * edgeInfo.fillingEdgeSideUnitLength;
      numVerticalElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case 'TBRL':
    case 'BTRL':
      console.log('TODO');
      break;
  }

  childContainers.forEach(function(c, i) {
    c.visualspace.width = edgeInfo.remainingEdgeSideUnitLength;
    c.visualspace.height = edgeInfo.fillingEdgeSideUnitLength;
    c.visualspace.posX = xOrig + xInc * Math.floor(i / numVerticalElement);
    c.visualspace.posY = yOrig + yInc * (i % numVerticalElement);
    c.visualspace.padding = layout.padding;
  });
}

function applyEdgeInfoVerticalDirection(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
): void {
  let xInc: number = null;
  let yInc: number = null;
  let numHoriElement: number = null;
  let xOrig: number = null;
  let yOrig: number = null;

  switch (layout.direction) {
    case 'LRTB':
      xOrig = 0;
      yOrig = 0;
      xInc = edgeInfo.fillingEdgeSideUnitLength;
      yInc = edgeInfo.remainingEdgeSideUnitLength;
      numHoriElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case 'LRBT':
      xOrig = 0;
      yOrig = parentContainer.visualspace.height - edgeInfo.remainingEdgeSideUnitLength;
      xInc = edgeInfo.fillingEdgeSideUnitLength;
      yInc = -1.0 * edgeInfo.remainingEdgeSideUnitLength;
      numHoriElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case 'RLBT':
    case 'RLTB':
      console.log('TODO');
      break;
  }

  childContainers.forEach(function(c, i) {
    c.visualspace.width = edgeInfo.fillingEdgeSideUnitLength;
    c.visualspace.height = edgeInfo.remainingEdgeSideUnitLength;
    c.visualspace.posX = xOrig + xInc * (i % numHoriElement);
    c.visualspace.posY = yOrig + yInc * Math.floor(i / numHoriElement);
    c.visualspace.padding = layout.padding;
  });
}

export function applyEdgeInfo(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
): void {
  if (isVerticalDirection(layout.direction)) {
    applyEdgeInfoVerticalDirection(parentContainer, childContainers, layout, edgeInfo);
  } else {
    applyEdgeInfoHorizontalDirection(parentContainer, childContainers, layout, edgeInfo);
  }
}

export function getAvailableSpace(container: Container, layout: Layout): number {
  const {visualspace = {height: 0, width: 0, padding: {top: 0, right: 0, bottom: 0, left: 0}}} = container;
  const {width, padding, height} = visualspace;
  const containerwidth = width - padding.left - padding.right;
  const containerheight = height - padding.top - padding.bottom;
  switch (layout.aspect_ratio) {
    case 'fillX':
      return width - padding.left - padding.right;
    case 'fillY':
      return height - padding.top - padding.bottom;
    case 'maxfill':
    case 'parent':
      return containerwidth * containerheight;
    case 'square':
      return Math.pow(Math.min(containerwidth, containerheight), 2);
  }
}

export function getPosXforFillX(parentVisualspace: any, layout: Layout, childContainers: Container[]): void {
  let start: number = null;
  let direction: number = null;
  let offset: number = null;

  switch (layout.direction) {
    case 'LRTB':
    case 'LRBT':
    case 'TBLR':
    case 'BTLR':
    case 'LR':
      start = 0;
      direction = 1;
      break;
    case 'RLBT':
    case 'RLTB':
    case 'BTRL':
    case 'TBRL':
    case 'RL':
      start = childContainers.length - 1;
      direction = -1;
      break;
    default:
      console.log('Unsupported Layout Direction', layout);
  }

  const totalwidth = sum(childContainers, function(c) {
    return c.visualspace.width + layout.margin.left + layout.margin.right;
  });

  switch (layout.align) {
    case 'left':
    case 'LT':
    case 'LM':
    case 'LB':
      offset = parentVisualspace.padding.left;
      break;
    case 'center':
    case 'CT':
    case 'CM':
    case 'CB':
      offset =
        parentVisualspace.padding.left +
        (parentVisualspace.width - parentVisualspace.padding.left - parentVisualspace.padding.right) / 2 -
        totalwidth / 2;
      break;
    case 'right':
    case 'RT':
    case 'RM':
    case 'RB':
      offset = parentVisualspace.width - parentVisualspace.padding.right - totalwidth;
      break;
  }

  childContainers.forEach(function(c, i, all) {
    const index = start + direction * i;
    if (i === 0) {
      all[index].visualspace.posX = offset + layout.margin.left;
    } else {
      all[index].visualspace.posX =
        all[index - direction].visualspace.posX +
        all[index - direction].visualspace.width +
        layout.margin.right +
        layout.margin.left;
    }
  });
}

export function getPosYforFillY(parentVisualspace: any, layout: Layout, childContainers: Container[]): void {
  let start: number = null;
  let direction: number = null;
  let offset: number = null;

  switch (layout.direction) {
    case 'LRTB':
    case 'RLTB':
    case 'TBLR':
    case 'TBRL':
    case 'TB':
      start = 0;
      direction = 1;
      break;
    case 'LRBT':
    case 'RLBT':
    case 'BTLR':
    case 'BTRL':
    case 'BT':
      start = childContainers.length - 1;
      direction = -1;
      break;
    default:
      console.log('Unsupported Layout Direction', layout);
  }

  const totalheight = sum(childContainers, function(c) {
    return c.visualspace.height + layout.margin.top + layout.margin.bottom;
  });

  switch (layout.align) {
    case 'top':
    case 'RT':
    case 'CT':
    case 'LT':
      offset = parentVisualspace.padding.top;
      break;
    case 'middle':
    case 'LM':
    case 'RM':
    case 'CM':
      offset =
        parentVisualspace.padding.top +
        (parentVisualspace.height - parentVisualspace.padding.top - parentVisualspace.padding.bottom) / 2 -
        totalheight / 2;
      break;
    case 'bottom':
    case 'LB':
    case 'CB':
    case 'RB':
      offset = parentVisualspace.height - parentVisualspace.padding.bottom - totalheight;
      break;
  }

  childContainers.forEach(function(c, i, all) {
    const index = start + direction * i;
    if (i === 0) {
      all[index].visualspace.posY = offset + layout.margin.top;
    } else {
      all[index].visualspace.posY =
        all[index - direction].visualspace.posY +
        all[index - direction].visualspace.height +
        layout.margin.bottom +
        layout.margin.top;
    }
  });
}

export function calcFillGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
): void {
  const parentVisualSpace = parentContainer.visualspace;

  if (layout.aspect_ratio === 'fillX') {
    const unitWidth = unitLength;

    childContainers.forEach(function(c) {
      c.visualspace.width = unitWidth * getValue(c, layout) - layout.margin.left - layout.margin.right;

      c.visualspace.height =
        parentVisualSpace.height -
        parentVisualSpace.padding.top -
        parentVisualSpace.padding.bottom -
        layout.margin.top -
        layout.margin.bottom;

      c.visualspace.posY = parentVisualSpace.padding.top + layout.margin.top;

      c.visualspace.padding = layout.padding;
    });

    getPosXforFillX(parentVisualSpace, layout, childContainers);
  } else if (layout.aspect_ratio === 'fillY') {
    const unitHeight = unitLength;

    childContainers.forEach(function(c) {
      c.visualspace.height = unitHeight * getValue(c, layout) - layout.margin.top - layout.margin.bottom;

      c.visualspace.width =
        parentVisualSpace.width -
        parentVisualSpace.padding.left -
        parentVisualSpace.padding.right -
        layout.margin.left -
        layout.margin.right;

      c.visualspace.posX = parentVisualSpace.padding.left + layout.margin.left;

      c.visualspace.padding = layout.padding;
    });

    getPosYforFillY(parentVisualSpace, layout, childContainers);
  } else {
    console.log('TODO');
  }
}

export function calcPackGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
): void {
  switch (layout.aspect_ratio) {
    case 'square':
      childContainers.forEach(function(c) {
        c.visualspace.width = Math.sqrt(unitLength * getValue(c, layout));
        c.visualspace.height = Math.sqrt(unitLength * getValue(c, layout));
        c.visualspace.posX =
          parentContainer.visualspace.padding.left +
          layout.margin.left +
          0.5 *
            (parentContainer.visualspace.width -
              c.visualspace.width -
              parentContainer.visualspace.padding.left -
              parentContainer.visualspace.padding.right);
        c.visualspace.posY =
          parentContainer.visualspace.padding.top +
          layout.margin.top +
          0.5 *
            (parentContainer.visualspace.height -
              c.visualspace.height -
              parentContainer.visualspace.padding.top -
              parentContainer.visualspace.padding.right);
      });
  }
}

export function getSharingAncestorContainer(
  container: Container,
  layout: Layout,
  item: 'size' | 'subgroup' | null,
): Container {
  if (!layout) {
    return container;
  }
  if (layout.type === 'flatten') {
    return container;
  }

  if (layout[item] && layout[item].isShared) {
    if (container && container.parent !== 'RootContainer') {
      const parentContainer: any = container.parent;
      const parentLayout: any = container.parent;
      return getSharingAncestorContainer(parentContainer as Container, parentLayout as Layout, item);
    }
  }
  return container;
}
