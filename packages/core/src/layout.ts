import {maxIndex, min, minIndex} from './array.js';
import type {Container, EdgeInfo, Layout} from './types.js';
import treemapMultidimensional from './treemap.js';
import {makeContainers} from './container.js';
import {
  isVerticalDirection,
  getCombination,
  getUnit,
  getValue,
  getParents,
  applyEdgeInfo,
  getAvailableSpace,
  calcFillGridxyVisualSpaceWithUnitLength,
  getSharingAncestorContainer,
  calcPackGridxyUnitLength,
  calcPackGridxyVisualSpaceWithUnitLength,
  unitAspectRatio,
} from './utils.js';

// add linked list connections across layouts
export function buildLayoutList(layouts: Layout[]): {head: string | Layout} {
  const layoutList = {
    head: layouts[0],
  };

  layouts.forEach(function(layout, i, all) {
    if (i > 0) {
      layout.parent = all[i - 1];
    } else {
      layout.parent = 'StartOfLayout';
    }
    if (i < all.length - 1) {
      layout.child = all[i + 1];
    } else {
      layout.child = 'EndOfLayout';
    }
  });
  return layoutList;
}

function buildEdgeInfoByDirection(
  horizontalRepetitionCount: number,
  verticalRepetitionCount: number,
  width: number,
  height: number,
  layout: Layout,
): EdgeInfo {
  const isVert = isVerticalDirection(layout.direction!);
  return {
    fillingEdgeRepetitionCount: isVert ? horizontalRepetitionCount : verticalRepetitionCount,
    remainingEdgeRepetitionCount: isVert ? verticalRepetitionCount : horizontalRepetitionCount,
    fillingEdgeSideUnitLength: isVert ? width : height,
    remainingEdgeSideUnitLength: isVert ? height : width,
  };
}

function buildEdgeInfoForMaxFill(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): EdgeInfo {
  const combinations = getCombination(childContainers.length);

  const combinationForWidthAndHeight = combinations.map(function(d) {
    const width = parentContainer.visualspace.width / d.a;
    const height = parentContainer.visualspace.height / d.b;
    return {
      width,
      height,
      horizontalRepetitionCount: d.a,
      verticalRepetitionCount: d.b,
      minEdge: width > height ? height : width,
    };
  });

  // The grid that leaves the units as large as possible is the one whose
  // shorter edge is longest.
  const minCombi = maxIndex(combinationForWidthAndHeight, d => d.minEdge);

  const edgeInfo = combinationForWidthAndHeight[minCombi];

  return buildEdgeInfoByDirection(
    edgeInfo.horizontalRepetitionCount,
    edgeInfo.verticalRepetitionCount,
    edgeInfo.width,
    edgeInfo.height,
    layout,
  );
}

function buildEdgeInfoFromMinSize(
  parentContainer: Container,
  minSize: {height: number; width: number},
  layout: Layout,
): EdgeInfo {
  const horizontalRepetitionCount = Math.floor(parentContainer.visualspace.width / minSize.width);
  const verticalRepetitionCount = Math.floor(parentContainer.visualspace.height / minSize.height);

  return buildEdgeInfoByDirection(
    horizontalRepetitionCount,
    verticalRepetitionCount,
    minSize.width,
    minSize.height,
    layout,
  );
}

function applySharedSizeOnContainers(minSize: {height: number; width: number}, layout: Layout): void {
  const parentContainers = getParents(layout.sizeSharingGroup);

  parentContainers.forEach(function(c: Container) {
    const edgeInfo = buildEdgeInfoFromMinSize(c, minSize, layout);

    applyEdgeInfo(c, childrenOf(c), layout, edgeInfo);
  });
}

/**
 * The size-sharing group is gathered from levels that have already been split,
 * so every container in it holds further containers rather than data rows.
 */
function childrenOf(container: Container): Container[] {
  return container.contents as Container[];
}

function applySharedUnitOnContainers(minUnit: number, layout: Layout): void {
  const parentContainers = getParents(layout.sizeSharingGroup);

  parentContainers.forEach(function(d: Container): void {
    switch (layout.aspect_ratio) {
      case 'fillX':
      case 'fillY':
        calcFillGridxyVisualSpaceWithUnitLength(d, childrenOf(d), layout, minUnit);
        break;
      case 'square':
      case 'parent':
      case 'custom':
      case 'maxfill':
        calcPackGridxyVisualSpaceWithUnitLength(d, childrenOf(d), layout, minUnit);
    }
  });
}
function getMinUnitAmongContainers(layout: Layout): number {
  const parentContainers = getParents(layout.sizeSharingGroup);

  return min(parentContainers, (d: Container): number => {
    return getUnitForContainer(d, childrenOf(d), layout);
  })!;
}

/**
 * What one unit of this level's `size` is worth inside a container: a length for
 * a fill level, an area for a weighted packing level.
 *
 * They are the same quantity in different dimensions -- how much of the parent
 * one row buys -- which is why a shared level can minimize either of them across
 * its sharing group the same way.
 */
function getUnitForContainer(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): number {
  if (isWeightedPack(layout)) {
    return calcPackGridxyUnitLength(parentContainer, childContainers, layout);
  }
  return getUnit(getAvailableSpace(parentContainer, layout), childContainers, layout);
}

/**
 * Whether this level packs boxes whose area carries a value, rather than a grid
 * of equal cells.
 *
 * `maxfill` is weighted too, but squarifies into a treemap instead — it fills
 * its parent exactly and so has no unit to share.
 */
function isWeightedPack(layout: Layout): boolean {
  const type = layout.size && layout.size.type;
  if (!type || type === 'uniform') {
    return false;
  }
  const ratio = layout.aspect_ratio;
  return ratio === 'square' || ratio === 'parent' || ratio === 'custom';
}

function makeSharedSizeFill(layout: Layout): void {
  applySharedUnitOnContainers(getMinUnitAmongContainers(layout), layout);
}
function getMinAmongContainers(layout: Layout): {height: number; width: number} {
  const sharedContainers = layout.sizeSharingGroup!;

  // Packing wants the smallest box in the group, so that one unit size fits
  // every container. `maxfill` boxes vary in both axes at once, so they are
  // ranked on their shorter edge first and their longer edge as a tiebreak;
  // the other ratios keep their aspect and can be ranked on width alone.
  if (layout.aspect_ratio === 'maxfill') {
    const minContainer = sharedContainers.reduce(function(pre: Container, cur: Container) {
      let minPre, maxPre, minCur, maxCur;

      if (pre.visualspace.height > pre.visualspace.width) {
        minPre = pre.visualspace.width;
        maxPre = pre.visualspace.height;
      } else {
        minPre = pre.visualspace.height;
        maxPre = pre.visualspace.width;
      }

      if (cur.visualspace.height > cur.visualspace.width) {
        minCur = cur.visualspace.width;
        maxCur = cur.visualspace.height;
      } else {
        minCur = cur.visualspace.height;
        maxCur = cur.visualspace.width;
      }

      if (minCur < minPre) {
        return cur;
      } else if (minCur == minPre) {
        if (maxCur < maxPre) {
          return cur;
        }
      }
      return pre;
    });

    return {
      width: minContainer.visualspace.width,
      height: minContainer.visualspace.height,
    };
  }

  const minSizeItemIndex = minIndex(sharedContainers, d => d.visualspace.width);
  return {
    width: sharedContainers[minSizeItemIndex].visualspace.width,
    height: sharedContainers[minSizeItemIndex].visualspace.height,
  };
}

function makeSharedSizePack(layout: Layout): void {
  if (layout.size!.type === 'uniform') {
    applySharedSizeOnContainers(getMinAmongContainers(layout), layout);
  } else {
    applySharedUnitOnContainers(getMinUnitAmongContainers(layout), layout);
  }
}

function makeSharedSize(layout: Layout): void {
  switch (layout.aspect_ratio) {
    case 'fillX':
    case 'fillY':
      makeSharedSizeFill(layout);
      break;
    case 'square':
    case 'parent':
    case 'custom':
    case 'maxfill':
      makeSharedSizePack(layout);
      break;
  }
}

function applySharedSize(layout: Layout | string): void {
  if (!layout) {
    return;
  }
  const isString = typeof layout === 'string';
  if ((isString && layout === 'EndOfLayout') || (layout as Layout).size!.isShared !== true) {
    return;
  }

  makeSharedSize(layout as Layout);
  (layout as Layout).sizeSharingGroup = [];
}

function calcFillGridxyVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): void {
  const availableSpace = getAvailableSpace(parentContainer, layout);

  const unitLength = getUnit(availableSpace, childContainers, layout);

  calcFillGridxyVisualSpaceWithUnitLength(parentContainer, childContainers, layout, unitLength);
}

function handleSharedSize(container: Container, layout: Layout): void {
  if (layout && layout.size!.isShared) {
    if (!Object.hasOwn(layout, 'sizeSharingGroup')) {
      layout.sizeSharingGroup = [];
    }
    layout.sizeSharingGroup = layout.sizeSharingGroup!.concat(childrenOf(container));
  }
}

//Here ratio means the apect ratio of unit.
//ratio = Filling Edge side divided by RemainingEdge side
function getRepetitionCountForFillingEdge(
  fillingEdge: number,
  remainingEdge: number,
  numElement: number,
  ratio: number,
): EdgeInfo {
  let fillingEdgeRepetitionCount = 0;
  let remainingEdgeSideUnitLength,
    remainingEdgeRepetitionCount,
    numPossibleContainers,
    fillingEdgeSideUnitLength;

  do {
    fillingEdgeRepetitionCount++;
    fillingEdgeSideUnitLength = (1.0 * fillingEdge) / fillingEdgeRepetitionCount;

    remainingEdgeSideUnitLength = fillingEdgeSideUnitLength / ratio;

    remainingEdgeRepetitionCount = Math.floor(
      (remainingEdge * fillingEdgeRepetitionCount * ratio) / fillingEdge,
    );

    numPossibleContainers = remainingEdgeRepetitionCount * fillingEdgeRepetitionCount;
  } while (numElement > numPossibleContainers);

  return {
    fillingEdgeRepetitionCount: fillingEdgeRepetitionCount,
    remainingEdgeRepetitionCount: remainingEdgeRepetitionCount,
    fillingEdgeSideUnitLength: fillingEdgeSideUnitLength,
    remainingEdgeSideUnitLength: remainingEdgeSideUnitLength,
  };
}

function calcEdgeInfo(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  aspectRatio: number,
): EdgeInfo {
  if (isVerticalDirection(layout.direction!)) {
    return getRepetitionCountForFillingEdge(
      parentContainer.visualspace.width,
      parentContainer.visualspace.height,
      childContainers.length,
      aspectRatio,
    );
  } else {
    return getRepetitionCountForFillingEdge(
      parentContainer.visualspace.height,
      parentContainer.visualspace.width,
      childContainers.length,
      1 / aspectRatio,
    );
  }
}

function calcPackGridxyVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): void {
  // A weighted level's boxes differ in size, so there is no grid to find: the
  // boxes are shelved instead, at the largest scale this container can hold.
  // A shared level then re-runs the pack with the group's smallest scale.
  if (isWeightedPack(layout)) {
    calcPackGridxyVisualSpaceWithUnitLength(
      parentContainer,
      childContainers,
      layout,
      calcPackGridxyUnitLength(parentContainer, childContainers, layout),
    );
    return;
  }

  const edgeInfo = calcEdgeInfo(
    parentContainer,
    childContainers,
    layout,
    unitAspectRatio(parentContainer, layout),
  );
  applyEdgeInfo(parentContainer, childContainers, layout, edgeInfo);
}
function calcPackGridxyMaxFillVisualSpaceUniform(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): void {
  const edgeInfo = buildEdgeInfoForMaxFill(parentContainer, childContainers, layout);

  applyEdgeInfo(parentContainer, childContainers, layout, edgeInfo);
}

function calcPackGridxyMaxFillVisualSpaceFunction(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): void {
  // A treemap's weights are this level's `size` read over each child, the same
  // quantity every other weighted level divides its space by: `sum` aggregates
  // `size.key` across the child's rows and `count` is how many it holds. Over a
  // `flatten` level, where a child is one row, the two agree.
  const weightOf = (c: Container): number => getValue(c, layout);

  childContainers = childContainers.filter(function(d) {
    return weightOf(d) > 0;
  });

  childContainers.sort(function(c, d) {
    return weightOf(d) - weightOf(c);
  });

  const data = childContainers.map(weightOf);

  const coord = treemapMultidimensional(
    data,
    parentContainer.visualspace.width,
    parentContainer.visualspace.height,
  );

  childContainers.forEach(function(c, i) {
    const rect = coord[i];
    c.visualspace.width = rect[2] - rect[0];
    c.visualspace.height = rect[3] - rect[1];
    c.visualspace.posX = rect[0];
    c.visualspace.posY = rect[1];
    c.visualspace.padding = layout.padding!;
  });
}

function calcPackGridxyMaxFillVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): void {
  if (layout.size!.type === 'uniform') {
    calcPackGridxyMaxFillVisualSpaceUniform(parentContainer, childContainers, layout);
  } else {
    calcPackGridxyMaxFillVisualSpaceFunction(parentContainer, childContainers, layout);
  }
}

function calcGridxyVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): void {
  switch (layout.aspect_ratio) {
    case 'fillX':
    case 'fillY':
      calcFillGridxyVisualSpace(parentContainer, childContainers, layout);
      break;
    case 'square':
    case 'parent':
    case 'custom':
      calcPackGridxyVisualSpace(parentContainer, childContainers, layout);
      break;
    case 'maxfill':
      calcPackGridxyMaxFillVisualSpace(parentContainer, childContainers, layout);
  }
}

function calcVisualSpace(parentContainer: Container, childContainers: Container[], layout: Layout): void {
  layout.containers = childContainers;

  switch (layout.type) {
    case 'gridxy':
      calcGridxyVisualSpace(parentContainer, childContainers, layout);
      break;
    default:
      console.log('Unsupported Layout type');
      break;
  }
}

export function applyLayout(containerList: Container[], layout: Layout): Container[] {
  let childContainers: Container[] = [];
  let oldSizeSharingAncestor = getSharingAncestorContainer(containerList[0], layout, 'size');

  containerList.forEach(function(container) {
    const newSizeSharingAncestor = getSharingAncestorContainer(container, layout, 'size');
    if (newSizeSharingAncestor !== oldSizeSharingAncestor) {
      applySharedSize(layout);
      oldSizeSharingAncestor = newSizeSharingAncestor;
    }

    const newContainers = makeContainers(container, layout);

    if (newContainers.length > 0) {
      calcVisualSpace(container, newContainers, layout);
    }
    container.contents = newContainers;
    handleSharedSize(container, layout);
    childContainers = childContainers.concat(newContainers);
  });

  applySharedSize(layout);

  return childContainers;
}
