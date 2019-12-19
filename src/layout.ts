import {
  min,
  extent,
  sum,
  scan,
  range,
  // @ts-ignore
  bin,
} from 'd3-array';
import {scaleLinear} from 'd3-scale';
import {Layout, Container, EdgeInfo} from '../index.d';
import treemapMultidimensional from './treemap';

// add linked list connections across layouts
export function buildLayoutList(layouts: Layout[]): any {
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

export function applyLayout(containerList: Container[], layout: Layout) {
  var childContainers: Container[] = [];
  var newSizeSharingAncestor;
  var oldSizeSharingAncestor = getSharingAncestorContainer(
    containerList[0],
    layout,
    'size',
  );

  containerList.forEach(function(container, i, all) {
    newSizeSharingAncestor = getSharingAncestorContainer(
      container,
      layout,
      'size',
    );
    if (newSizeSharingAncestor !== oldSizeSharingAncestor) {
      applySharedSize(layout);
      oldSizeSharingAncestor = newSizeSharingAncestor;
    }

    var newContainers = makeContainers(container, layout) || [];

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

function getSharingAncestorContainer(
  container: Container,
  layout: Layout,
  item: string,
): Container {
  if (layout.type === 'flatten') {
    return container;
  }

  if (layout[item] && layout[item].isShared) {
    if (container && container.parent !== 'RootContainer') {
      const parentContainer: any = container.parent;
      const parentLayout: any = container.parent;
      return getSharingAncestorContainer(
        parentContainer as Container,
        parentLayout as Layout,
        item,
      );
    }
  }
  return container;
}

function makeContainers(container: Container, layout: Layout) {
  var sharingAncestorContainer = getSharingAncestorContainer(
    container,
    layout,
    'subgroup',
  );

  var sharingDomain = getSharingDomain(sharingAncestorContainer);
  var childContainers;

  switch (layout.subgroup && layout.subgroup.type) {
    case 'groupby':
      childContainers = makeContainersForCategoricalVar(
        sharingDomain,
        container,
        layout,
      );
      break;
    case 'bin':
      childContainers = makeContainersForNumericalVar(
        sharingDomain,
        container,
        layout,
      );
      break;
    case 'passthrough':
      childContainers = makeContainersForPassthrough(container, layout);
      break;
    case 'flatten':
      childContainers = makeContainersForFlatten(container, layout);
      break;
  }

  return childContainers;
}

function getSharingDomain(container: Container): Container[] {
  if (isContainer(container)) {
    const leafs: Container[] = [];
    container.contents.forEach(function(c) {
      var newLeaves = getSharingDomain(c);

      newLeaves.forEach(function(d) {
        leafs.push(d);
      });
    });
    return leafs;
  } else {
    return [container];
  }
}

function isContainer(container: Container) {
  if (
    container.hasOwnProperty('contents') &&
    container.hasOwnProperty('visualspace') &&
    container.hasOwnProperty('parent')
  ) {
    return true;
  }
  return false;
}

function applySharedSizeOnContainers(
  minSize: {height: number; width: number},
  layout: Layout,
) {
  var parentContainers = getParents(layout.sizeSharingGroup);

  parentContainers.forEach(function(c: Container) {
    var edgeInfo = buildEdgeInfoFromMinSize(c, minSize, layout);

    applyEdgeInfo(c, c.contents, layout, edgeInfo);
  });
}

function applySharedSize(layout: Layout | string) {
  const isString = typeof layout === 'string';
  if (
    (isString && layout === 'EndOfLayout') ||
    (layout as Layout).size.isShared !== true
  ) {
    return;
  }

  makeSharedSize(layout as Layout);
  (layout as Layout).sizeSharingGroup = [];
}

function makeSharedSize(layout: Layout) {
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

function makeSharedSizeFill(layout: Layout) {
  var minUnit = getMinUnitAmongContainers(layout);

  applySharedUnitOnContainers(minUnit, layout);
}

function applySharedUnitOnContainers(minUnit: number, layout: Layout) {
  var parentContainers = getParents(layout.sizeSharingGroup);

  parentContainers.forEach(function(d: Container) {
    switch (layout.aspect_ratio) {
      case 'fillX':
      case 'fillY':
        calcFillGridxyVisualSpaceWithUnitLength(d, d.contents, layout, minUnit);
        break;
      case 'square':
      case 'parent':
      case 'custom':
      case 'maxfill':
        calcPackGridxyVisualSpaceWithUnitLength(d, d.contents, layout, minUnit);
    }
  });
}

function makeSharedSizePack(layout: Layout) {
  if (layout.size.type === 'uniform') {
    var minSize = getMinAmongContainers(layout);
    applySharedSizeOnContainers(minSize, layout);
  } else {
    var minUnit = getMinUnitAmongContainers(layout);
    applySharedUnitOnContainers(minUnit, layout);
  }
}

function calcFillGridxyVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
  var availableSpace = getAvailableSpace(parentContainer, layout);

  var unitLength = getUnit(availableSpace, childContainers, layout);

  calcFillGridxyVisualSpaceWithUnitLength(
    parentContainer,
    childContainers,
    layout,
    unitLength,
  );
}

function calcFillGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
) {
  var parentVisualSpace = parentContainer.visualspace;

  if (layout.aspect_ratio === 'fillX') {
    var unitWidth = unitLength;

    childContainers.forEach(function(c, i, all) {
      c.visualspace.width =
        unitWidth * getValue(c, layout) -
        layout.margin.left -
        layout.margin.right;

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
    var unitHeight = unitLength;

    childContainers.forEach(function(c, i, all) {
      c.visualspace.height =
        unitHeight * getValue(c, layout) -
        layout.margin.top -
        layout.margin.bottom;

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

function getPosXforFillX(
  parentVisualspace: any,
  layout: Layout,
  childContainers: Container[],
) {
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

  var totalwidth = sum(childContainers, function(c) {
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
        (parentVisualspace.width -
          parentVisualspace.padding.left -
          parentVisualspace.padding.right) /
          2 -
        totalwidth / 2;
      break;
    case 'right':
    case 'RT':
    case 'RM':
    case 'RB':
      offset =
        parentVisualspace.width - parentVisualspace.padding.right - totalwidth;
      break;
  }

  childContainers.forEach(function(c, i, all) {
    var index = start + direction * i;
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

function getPosYforFillY(
  parentVisualspace: any,
  layout: Layout,
  childContainers: Container[],
) {
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

  var totalheight = sum(childContainers, function(c) {
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
        (parentVisualspace.height -
          parentVisualspace.padding.top -
          parentVisualspace.padding.bottom) /
          2 -
        totalheight / 2;
      break;
    case 'bottom':
    case 'LB':
    case 'CB':
    case 'RB':
      offset =
        parentVisualspace.height -
        parentVisualspace.padding.bottom -
        totalheight;
      break;
  }

  childContainers.forEach(function(c, i, all) {
    var index = start + direction * i;
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

function handleSharedSize(container: Container, layout: Layout) {
  if (layout.size.isShared) {
    if (!layout.hasOwnProperty('sizeSharingGroup')) {
      layout.sizeSharingGroup = [];
    }
    layout.sizeSharingGroup = layout.sizeSharingGroup.concat(
      container.contents,
    );
  }
}

function calcVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
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

function calcGridxyVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
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
      calcPackGridxyMaxFillVisualSpace(
        parentContainer,
        childContainers,
        layout,
      );
  }
}

function calcPackGridxyMaxFillVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
  if (layout.size.type === 'uniform') {
    calcPackGridxyMaxFillVisualSpaceUniform(
      parentContainer,
      childContainers,
      layout,
    );
  } else {
    calcPackGridxyMaxFillVisualSpaceFunction(
      parentContainer,
      childContainers,
      layout,
    );
  }
}

function calcPackGridxyMaxFillVisualSpaceFunction(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
  childContainers = childContainers.filter(function(d) {
    return Number(d['contents'][0][layout.size.key] > 0);
  });

  childContainers.sort(function(c, d) {
    return (
      d['contents'][0][layout.size.key] - c['contents'][0][layout.size.key]
    );
  });

  var data = childContainers.map(function(d) {
    return Number(d['contents'][0][layout.size.key]);
  });

  var coord = treemapMultidimensional(
    data,
    parentContainer.visualspace.width,
    parentContainer.visualspace.height,
  );

  childContainers.forEach(function(c, i, all) {
    var rect = coord[i];
    c.visualspace.width = rect[2] - rect[0];
    c.visualspace.height = rect[3] - rect[1];
    c.visualspace.posX = rect[0];
    c.visualspace.posY = rect[1];
    c.visualspace.padding = layout.padding;
  });
}
function calcPackGridxyMaxFillVisualSpaceUniform(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
  var edgeInfo = buildEdgeInfoForMaxFill(
    parentContainer,
    childContainers,
    layout,
  );

  applyEdgeInfo(parentContainer, childContainers, layout, edgeInfo);
}

function buildEdgeInfoForMaxFill(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
  var combinations = getCombination(childContainers.length);

  var combinationForWidthAndHeight = combinations.map(function(d) {
    return {
      width: parentContainer.visualspace.width / d.a,
      height: parentContainer.visualspace.height / d.b,
      horizontalRepetitionCount: d.a,
      verticalRepetitionCount: d.b,
    };
  });

  combinationForWidthAndHeight.forEach(function(d: any) {
    d.minEdge = d.width > d.height ? d.height : d.width;
  });

  var minCombi = scan(combinationForWidthAndHeight, function(a: any, b: any) {
    return b.minEdge - a.minEdge;
  });

  var edgeInfo = combinationForWidthAndHeight[minCombi];

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
) {
  var horizontalRepetitionCount = Math.floor(
    parentContainer.visualspace.width / minSize.width,
  );
  var verticalRepetitionCount = Math.floor(
    parentContainer.visualspace.height / minSize.height,
  );

  return buildEdgeInfoByDirection(
    horizontalRepetitionCount,
    verticalRepetitionCount,
    minSize.width,
    minSize.height,
    layout,
  );
}

function buildEdgeInfoByDirection(
  horizontalRepetitionCount: number,
  verticalRepetitionCount: number,
  width: number,
  height: number,
  layout: Layout,
) {
  const isVert = isVerticalDirection(layout.direction);
  return {
    fillingEdgeRepetitionCount: isVert
      ? horizontalRepetitionCount
      : verticalRepetitionCount,
    remainingEdgeRepetitionCount: isVert
      ? verticalRepetitionCount
      : horizontalRepetitionCount,
    fillingEdgeSideUnitLength: isVert ? width : height,
    remainingEdgeSideUnitLength: isVert ? height : width,
  };
}

function getKeys(data: any, groupby: string) {
  return Object.keys(
    data.reduce((acc: any, row: any) => {
      acc[row[groupby]] = true;
      return acc;
    }, {}),
  );
  // var myNest = d3
  //   .nest()
  //   .key(function(d: any) {
  //     return d[groupby];
  //   })
  //   .entries(data);
  // console.log(myNest);
  // return myNest.map(function(d) {
  //   return d.key;
  // });
}

function emptyContainersFromKeys(data: any, groupby: string) {
  return getKeys(data, groupby).map(function(key) {
    return {
      contents: [],
      label: key,
      visualspace: {},
    };
  });
}

function getCombination(n: number) {
  var combi = range(1, n + 1);

  return combi.map(function(d) {
    return {
      a: d,
      b: Math.ceil(n / d),
    };
  });
}

function getUnit(
  availableSpace: number,
  childContainers: Container[],
  layout: Layout,
) {
  return availableSpace / sum(childContainers, d => getValue(d, layout));
}

function getValue(container: Container, layout: Layout) {
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

function calcPackGridxyVisualSpace(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
) {
  var aspect_ratio;

  switch (layout.aspect_ratio) {
    case 'square':
      aspect_ratio = 1;
      break;
    case 'parent':
      aspect_ratio =
        parentContainer.visualspace.width / parentContainer.visualspace.height;
      break;
  }
  var edgeInfo = calcEdgeInfo(
    parentContainer,
    childContainers,
    layout,
    aspect_ratio,
  );
  applyEdgeInfo(parentContainer, childContainers, layout, edgeInfo);
}

function calcEdgeInfo(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  aspect_ratio: number,
) {
  if (isVerticalDirection(layout.direction)) {
    var edgeInfo = getRepetitionCountForFillingEdge(
      parentContainer.visualspace.width,
      parentContainer.visualspace.height,
      childContainers.length,
      aspect_ratio,
    );
  } else {
    var edgeInfo = getRepetitionCountForFillingEdge(
      parentContainer.visualspace.height,
      parentContainer.visualspace.width,
      childContainers.length,
      1 / aspect_ratio,
    );
  }
  return edgeInfo;
}

function calcPackGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
) {
  switch (layout.aspect_ratio) {
    case 'square':
      childContainers.forEach(function(c, i, all) {
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

function applyEdgeInfo(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
) {
  if (isVerticalDirection(layout.direction)) {
    applyEdgeInfoVerticalDirection(
      parentContainer,
      childContainers,
      layout,
      edgeInfo,
    );
  } else {
    applyEdgeInfoHorizontalDirection(
      parentContainer,
      childContainers,
      layout,
      edgeInfo,
    );
  }
}

function applyEdgeInfoHorizontalDirection(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
) {
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
      yOrig =
        parentContainer.visualspace.height -
        edgeInfo.remainingEdgeSideUnitLength;
      xInc = edgeInfo.remainingEdgeSideUnitLength;
      yInc = -1.0 * edgeInfo.fillingEdgeSideUnitLength;
      numVerticalElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case 'TBRL':
    case 'BTRL':
      console.log('TODO');
      break;
  }

  childContainers.forEach(function(c, i, all) {
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
) {
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
      yOrig =
        parentContainer.visualspace.height -
        edgeInfo.remainingEdgeSideUnitLength;
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

//Here ratio means the apect ratio of unit.
//ratio = Filling Edge side divided by RemainingEdge side

function getRepetitionCountForFillingEdge(
  fillingEdge: number,
  remainingEdge: number,
  numElement: number,
  ratio: number,
) {
  var fillingEdgeRepetitionCount = 0;
  var remainingEdgeSideUnitLength,
    remainingEdgeRepetitionCount,
    numPossibleContainers,
    fillingEdgeSideUnitLength;

  do {
    fillingEdgeRepetitionCount++;
    fillingEdgeSideUnitLength =
      (1.0 * fillingEdge) / fillingEdgeRepetitionCount;

    remainingEdgeSideUnitLength = fillingEdgeSideUnitLength / ratio;

    remainingEdgeRepetitionCount = Math.floor(
      (remainingEdge * fillingEdgeRepetitionCount * ratio) / fillingEdge,
    );

    numPossibleContainers =
      remainingEdgeRepetitionCount * fillingEdgeRepetitionCount;
  } while (numElement > numPossibleContainers);

  return {
    fillingEdgeRepetitionCount: fillingEdgeRepetitionCount,
    remainingEdgeRepetitionCount: remainingEdgeRepetitionCount,
    fillingEdgeSideUnitLength: fillingEdgeSideUnitLength,
    remainingEdgeSideUnitLength: remainingEdgeSideUnitLength,
  };
}

function isVerticalDirection(direction: string) {
  switch (direction) {
    case 'LRBT':
    case 'LRTB':
    case 'RLBT':
    case 'RLTB':
      return true;
    case 'BTLR':
    case 'BTRL':
    case 'TBLR':
    case 'TBLR':
      return false;
  }
}

function getMinAmongContainers(
  layout: Layout,
): {height: number; width: number} {
  var shared_containers = layout.sizeSharingGroup;

  var minSizeItemIndex;

  switch (layout.aspect_ratio) {
    case 'square':
    case 'parent':
    case 'custom':
      minSizeItemIndex = scan(shared_containers, function(
        a: Container,
        b: Container,
      ) {
        return a.visualspace.width - b.visualspace.width;
      });
      return {
        width: shared_containers[minSizeItemIndex].visualspace.width,
        height: shared_containers[minSizeItemIndex].visualspace.height,
      };
      break;
    case 'maxfill':
      var tempMinorSide = shared_containers.map(function(d: Container) {
        return d.visualspace.width > d.visualspace.height
          ? d.visualspace.height
          : d.visualspace.width;
      });
      minSizeItemIndex = scan(tempMinorSide, (a, b) => a - b);

      var minContainer = shared_containers.reduce(function(
        pre: any,
        cur: Container,
      ) {
        var minPre, maxPre, minCur, maxCur;

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
}

function getParents(containers: Container[] = []) {
  var mySet = new Set();
  containers.forEach(d => mySet.add(d.parent));
  return Array.from(mySet);
}

function getMinUnitAmongContainers(layout: Layout) {
  var parentContainers = getParents(layout.sizeSharingGroup);

  var minUnit = min(parentContainers, function(d: Container) {
    var availableSpace = getAvailableSpace(d, layout);
    var unit = getUnit(availableSpace, d.contents, layout);
    return unit;
  });
  return minUnit;
}

function makeContainersForPassthrough(container: Container, layout: Layout) {
  return [
    {
      contents: container.contents,
      label: container.label,
      visualspace: {},
      parent: container,
    },
  ];
}

function makeContainersForFlatten(container: Container, layout: Layout) {
  var leaves = container.contents.map(function(c, i) {
    return {
      contents: [c],
      label: i,
      visualspace: {},
      parent: container,
    };
  });

  if (layout.hasOwnProperty('sort')) {
    leaves.sort(function(a, b) {
      var Avalue = a.contents[0][layout.sort.key];
      var Bvalue = b.contents[0][layout.sort.key];

      if (layout.sort.type === 'numerical') {
        Avalue = Number(Avalue);
        Bvalue = Number(Bvalue);
      }

      var ascending = layout.sort.direction === 'ascending' ? 1 : -1;

      return Avalue > Bvalue ? ascending : -1 * ascending;
    });
  }

  return leaves;
}

function makeContainersForCategoricalVar(
  sharingDomain: Container[],
  container: Container,
  layout: Layout,
) {
  var newContainers = emptyContainersFromKeys(
    sharingDomain,
    layout.subgroup.key,
  );

  newContainers.forEach(function(c: any, i, all) {
    c.contents = container.contents.filter(function(d) {
      return d[layout.subgroup.key] == c.label;
    });
    c.parent = container;
  });
  return newContainers;
}

function makeContainersForNumericalVar(
  sharingDomain: Container[],
  container: Container,
  layout: Layout,
) {
  var subgroup = layout.subgroup;

  var extentVal = extent(sharingDomain, (d: Container) => +d[subgroup.key]);

  var tempScale = scaleLinear()
    .domain([0, subgroup.numBin])
    .range(extentVal);
  var tickArray = range(subgroup.numBin + 1).map(tempScale);

  var nullGroup: any = container.contents.filter(function(d) {
    return d[subgroup.key] == '';
  });

  var valueGroup = container.contents.filter(function(d) {
    return d[subgroup.key] != '';
  });

  var bins = bin()
    .domain(extentVal)
    .thresholds(tickArray)
    .value(function(d: any) {
      return +d[subgroup.key];
    })(valueGroup);

  nullGroup = [nullGroup];
  nullGroup.x0 = '';
  nullGroup.x1 = '';

  var containers = nullGroup.concat(bins);

  containers = containers.map(function(d: Container) {
    return {
      contents: d,
      label: d.x0 + '-' + d.x1,
      visualspace: {},
      parent: container,
    };
  });

  return containers;
}

function getAvailableSpace(container: Container, layout: Layout) {
  switch (layout.aspect_ratio) {
    case 'fillX':
      return (
        container.visualspace.width -
        container.visualspace.padding.left -
        container.visualspace.padding.right
      );
    case 'fillY':
      return (
        container.visualspace.height -
        container.visualspace.padding.top -
        container.visualspace.padding.bottom
      );
    case 'maxfill':
    case 'parent':
      var width =
        container.visualspace.width -
        container.visualspace.padding.left -
        container.visualspace.padding.right;
      var height =
        container.visualspace.height -
        container.visualspace.padding.top -
        container.visualspace.padding.bottom;
      return width * height;
    case 'square':
      var width =
        container.visualspace.width -
        container.visualspace.padding.left -
        container.visualspace.padding.right;
      var height =
        container.visualspace.height -
        container.visualspace.padding.top -
        container.visualspace.padding.bottom;
      return Math.pow(Math.min(width, height), 2);
  }
}
