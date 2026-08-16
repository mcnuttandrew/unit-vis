import { range, sum } from "d3-array";
import type {
  Container,
  ContainerChild,
  DataRow,
  Direction,
  EdgeInfo,
  Layout,
  VisualSpace,
} from "./index.d";

/**
 * Whether a packing direction fills along the x axis and wraps along y.
 *
 * Only the four-letter forms name both axes, so only they can answer this. The
 * two-letter forms are for fill layouts, which read whichever axis they need
 * directly and never ask; they fall through to horizontal.
 */
export function isVerticalDirection(direction: Direction): boolean {
  switch (direction) {
    case "LRBT":
    case "LRTB":
    case "RLBT":
    case "RLTB":
      return true;
    default:
      return false;
  }
}

/**
 * The deepest containers hold data rows rather than further containers. The
 * callers of this have already descended to that level, so the cast records an
 * invariant the tree's shape cannot express.
 */
export function asRow(node: ContainerChild): DataRow {
  return node as DataRow;
}

export function getKeys(data: ContainerChild[], groupby: string): string[] {
  return Object.keys(
    data.reduce((acc: Record<string, boolean>, row) => {
      acc[String(asRow(row)[groupby])] = true;
      return acc;
    }, {}),
  );
}

export function emptyContainersFromKeys(
  data: ContainerChild[],
  groupby: string,
): Container[] {
  return getKeys(data, groupby).map(function (key) {
    return {
      contents: [],
      label: key,
      //   TODO this may break everything
      visualspace: {
        width: 0,
        height: 0,
        posX: 0,
        posY: 0,
        padding: { left: 0, right: 0, top: 0, bottom: 9 },
      },
      layout: null,
      parent: null,
    };
  });
}

export function getCombination(n: number): { a: number; b: number }[] {
  return range(1, n + 1).map((a) => ({ a, b: Math.ceil(n / a) }));
  // const combi = range(1, n + 1);

  // return combi.map(function(d) {
  //   return {
  //     a: d,
  //     b: Math.ceil(n / d),
  //   };
  // });
}

export function getValue(container: Container, layout: Layout): number {
  const size = layout.size;
  switch (size && size.type) {
    case "sum":
      return sum(container.contents, (d) => Number(asRow(d)[size!.key!]));
    case "count":
      return container.contents.length;
    // `uniform`, which is also what `applyDefault` writes onto any level that
    // omits `size`.
    default:
      return 1;
  }
}
export function getUnit(
  availableSpace: number,
  childContainers: Container[],
  layout: Layout,
): number {
  return availableSpace / sum(childContainers, (d) => getValue(d, layout));
}

/** Tells a node of the container tree apart from a data row sitting at a leaf. */
export function isContainer(node: ContainerChild): node is Container {
  return (
    Object.hasOwn(node, "contents") &&
    Object.hasOwn(node, "visualspace") &&
    Object.hasOwn(node, "parent")
  );
}

export function getParents(containers: Container[] = []): Container[] {
  const mySet = new Set<Container>();
  containers.forEach((d) => mySet.add(d.parent as Container));
  return Array.from(mySet);
}

function applyEdgeInfoHorizontalDirection(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
): void {
  let xInc = 0;
  let yInc = 0;
  let numVerticalElement = 0;
  let xOrig = 0;
  let yOrig = 0;
  switch (layout.direction) {
    case "TBLR":
      xOrig = 0;
      yOrig = 0;
      xInc = edgeInfo.remainingEdgeSideUnitLength;
      yInc = edgeInfo.fillingEdgeSideUnitLength;
      numVerticalElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case "BTLR":
      xOrig = 0;
      yOrig =
        parentContainer.visualspace.height -
        edgeInfo.remainingEdgeSideUnitLength;
      xInc = edgeInfo.remainingEdgeSideUnitLength;
      yInc = -1.0 * edgeInfo.fillingEdgeSideUnitLength;
      numVerticalElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case "TBRL":
    case "BTRL":
      console.log("TODO");
      break;
  }

  childContainers.forEach(function (c, i) {
    c.visualspace.width = edgeInfo.remainingEdgeSideUnitLength;
    c.visualspace.height = edgeInfo.fillingEdgeSideUnitLength;
    c.visualspace.posX = xOrig + xInc * Math.floor(i / numVerticalElement);
    c.visualspace.posY = yOrig + yInc * (i % numVerticalElement);
    c.visualspace.padding = layout.padding!;
  });
}

function applyEdgeInfoVerticalDirection(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
): void {
  let xInc = 0;
  let yInc = 0;
  let numHoriElement = 0;
  let xOrig = 0;
  let yOrig = 0;

  switch (layout.direction) {
    case "LRTB":
      xOrig = 0;
      yOrig = 0;
      xInc = edgeInfo.fillingEdgeSideUnitLength;
      yInc = edgeInfo.remainingEdgeSideUnitLength;
      numHoriElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case "LRBT":
      xOrig = 0;
      yOrig =
        parentContainer.visualspace.height -
        edgeInfo.remainingEdgeSideUnitLength;
      xInc = edgeInfo.fillingEdgeSideUnitLength;
      yInc = -1.0 * edgeInfo.remainingEdgeSideUnitLength;
      numHoriElement = edgeInfo.fillingEdgeRepetitionCount;
      break;
    case "RLBT":
    case "RLTB":
      console.log("TODO");
      break;
  }

  childContainers.forEach(function (c, i) {
    c.visualspace.width = edgeInfo.fillingEdgeSideUnitLength;
    c.visualspace.height = edgeInfo.remainingEdgeSideUnitLength;
    c.visualspace.posX = xOrig + xInc * (i % numHoriElement);
    c.visualspace.posY = yOrig + yInc * Math.floor(i / numHoriElement);
    c.visualspace.padding = layout.padding!;
  });
}

export function applyEdgeInfo(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  edgeInfo: EdgeInfo,
): void {
  if (isVerticalDirection(layout.direction!)) {
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

export function getAvailableSpace(
  container: Container,
  layout: Layout,
): number {
  const {
    visualspace = {
      height: 0,
      width: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    },
  } = container;
  const { width, padding, height } = visualspace;
  const containerwidth = width - padding.left - padding.right;
  const containerheight = height - padding.top - padding.bottom;
  switch (layout.aspect_ratio) {
    case "fillX":
      return width - padding.left - padding.right;
    case "fillY":
      return height - padding.top - padding.bottom;
    case "maxfill":
    case "parent":
      return containerwidth * containerheight;
    case "square":
      return Math.pow(Math.min(containerwidth, containerheight), 2);
    // `custom` is accepted by the grammar but unimplemented, so there is no
    // space to hand back; NaN carries that through to unsized boxes.
    default:
      return NaN;
  }
}

export function getPosXforFillX(
  parentVisualspace: VisualSpace,
  layout: Layout,
  childContainers: Container[],
): void {
  const margin = layout.margin!;
  let start = 0;
  let direction = 0;
  let offset = 0;

  switch (layout.direction) {
    case "LRTB":
    case "LRBT":
    case "TBLR":
    case "BTLR":
    case "LR":
      start = 0;
      direction = 1;
      break;
    case "RLBT":
    case "RLTB":
    case "BTRL":
    case "TBRL":
    case "RL":
      start = childContainers.length - 1;
      direction = -1;
      break;
    default:
      console.log("Unsupported Layout Direction", layout);
  }

  const totalwidth = sum(childContainers, function (c) {
    return c.visualspace.width + margin.left + margin.right;
  });

  switch (layout.align) {
    case "left":
    case "LT":
    case "LM":
    case "LB":
      offset = parentVisualspace.padding.left;
      break;
    case "center":
    case "CT":
    case "CM":
    case "CB":
      offset =
        parentVisualspace.padding.left +
        (parentVisualspace.width -
          parentVisualspace.padding.left -
          parentVisualspace.padding.right) /
          2 -
        totalwidth / 2;
      break;
    case "right":
    case "RT":
    case "RM":
    case "RB":
      offset =
        parentVisualspace.width - parentVisualspace.padding.right - totalwidth;
      break;
  }

  childContainers.forEach(function (_c, i, all) {
    const index = start + direction * i;
    if (i === 0) {
      all[index].visualspace.posX = offset + margin.left;
    } else {
      all[index].visualspace.posX =
        all[index - direction].visualspace.posX +
        all[index - direction].visualspace.width +
        margin.right +
        margin.left;
    }
  });
}

export function getPosYforFillY(
  parentVisualspace: VisualSpace,
  layout: Layout,
  childContainers: Container[],
): void {
  const margin = layout.margin!;
  let start = 0;
  let direction = 0;
  let offset = 0;

  switch (layout.direction) {
    case "LRTB":
    case "RLTB":
    case "TBLR":
    case "TBRL":
    case "TB":
      start = 0;
      direction = 1;
      break;
    case "LRBT":
    case "RLBT":
    case "BTLR":
    case "BTRL":
    case "BT":
      start = childContainers.length - 1;
      direction = -1;
      break;
    default:
      console.log("Unsupported Layout Direction", layout);
  }

  const totalheight = sum(childContainers, function (c) {
    return c.visualspace.height + margin.top + margin.bottom;
  });

  switch (layout.align) {
    case "top":
    case "RT":
    case "CT":
    case "LT":
      offset = parentVisualspace.padding.top;
      break;
    case "middle":
    case "LM":
    case "RM":
    case "CM":
      offset =
        parentVisualspace.padding.top +
        (parentVisualspace.height -
          parentVisualspace.padding.top -
          parentVisualspace.padding.bottom) /
          2 -
        totalheight / 2;
      break;
    case "bottom":
    case "LB":
    case "CB":
    case "RB":
      offset =
        parentVisualspace.height -
        parentVisualspace.padding.bottom -
        totalheight;
      break;
  }

  childContainers.forEach(function (_c, i, all) {
    const index = start + direction * i;
    if (i === 0) {
      all[index].visualspace.posY = offset + margin.top;
    } else {
      all[index].visualspace.posY =
        all[index - direction].visualspace.posY +
        all[index - direction].visualspace.height +
        margin.bottom +
        margin.top;
    }
  });
}

export function calcFillGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
): void {
  const margin = layout.margin!;
  const parentVisualSpace = parentContainer.visualspace;

  if (layout.aspect_ratio === "fillX") {
    const unitWidth = unitLength;

    childContainers.forEach(function (c) {
      c.visualspace.width =
        unitWidth * getValue(c, layout) -
        margin.left -
        margin.right;

      c.visualspace.height =
        parentVisualSpace.height -
        parentVisualSpace.padding.top -
        parentVisualSpace.padding.bottom -
        margin.top -
        margin.bottom;

      c.visualspace.posY = parentVisualSpace.padding.top + margin.top;

      c.visualspace.padding = layout.padding!;
    });

    getPosXforFillX(parentVisualSpace, layout, childContainers);
  } else if (layout.aspect_ratio === "fillY") {
    const unitHeight = unitLength;

    childContainers.forEach(function (c) {
      c.visualspace.height =
        unitHeight * getValue(c, layout) -
        margin.top -
        margin.bottom;

      c.visualspace.width =
        parentVisualSpace.width -
        parentVisualSpace.padding.left -
        parentVisualSpace.padding.right -
        margin.left -
        margin.right;

      c.visualspace.posX = parentVisualSpace.padding.left + margin.left;

      c.visualspace.padding = layout.padding!;
    });

    getPosYforFillY(parentVisualSpace, layout, childContainers);
  } else {
    console.log("TODO");
  }
}

export function calcPackGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
): void {
  const margin = layout.margin!;
  switch (layout.aspect_ratio) {
    case "square":
      childContainers.forEach(function (c) {
        c.visualspace.width = Math.sqrt(unitLength * getValue(c, layout));
        c.visualspace.height = Math.sqrt(unitLength * getValue(c, layout));
        c.visualspace.posX =
          parentContainer.visualspace.padding.left +
          margin.left +
          0.5 *
            (parentContainer.visualspace.width -
              c.visualspace.width -
              parentContainer.visualspace.padding.left -
              parentContainer.visualspace.padding.right);
        c.visualspace.posY =
          parentContainer.visualspace.padding.top +
          margin.top +
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
  item: "size" | "subgroup",
): Container {
  if (!layout) {
    return container;
  }
  if (layout.type === "flatten") {
    return container;
  }

  const policy = layout[item];
  if (policy && policy.isShared) {
    if (container && container.parent !== "RootContainer") {
      const parent = container.parent;
      return getSharingAncestorContainer(
        parent as Container,
        parent as Layout,
        item,
      );
    }
  }
  return container;
}
