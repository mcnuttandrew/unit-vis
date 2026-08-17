import { range, sum } from "./array.js";
import { weightedPackRects, weightedPackUnit } from "./shelf.js";
import type { WeightedPack } from "./shelf.js";
import type {
  Container,
  ContainerChild,
  DataRow,
  Direction,
  EdgeInfo,
  Layout,
  Mark,
  VisualSpace,
} from "./types.js";

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
/**
 * The field a `sum` policy sums, or a raised error naming what is missing.
 *
 * A `sum` with nothing to sum used to be a chart of invisible marks, which is
 * the failure mode this whole family of policies had. Raising says it once,
 * where the spec is wrong, rather than leaving it to be discovered on a blank
 * canvas.
 */
export function markSumKey(mark: Mark): string {
  const key = mark.size && mark.size.key;
  if (typeof key !== "string" || !key) {
    throw new Error(
      'unit-vis: mark size "sum" needs a `key` naming the field to sum, ' +
        `got ${JSON.stringify(key)}`,
    );
  }
  return key;
}

/**
 * What one unit mark's area is proportional to, under `mark.size.type` — the
 * mark-level counterpart of `getValue`, read over the rows of the container the
 * mark stands for.
 *
 * `max` has no value of its own: it is the room the container has rather than
 * anything in it, and comes out as 1 here so that it and `uniform` size alike.
 */
export function getMarkValue(container: Container, mark: Mark): number {
  switch (mark.size && mark.size.type) {
    case "sum": {
      const key = markSumKey(mark);
      return sum(container.contents, (d) => Number(asRow(d)[key]));
    }
    case "count":
      return container.contents.length;
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
  // The boxes run down (or up) a column and the columns advance across x, so
  // the filling edge is the height and the remaining edge the width.
  const width = edgeInfo.remainingEdgeSideUnitLength;
  const height = edgeInfo.fillingEdgeSideUnitLength;
  const numVerticalElement = edgeInfo.fillingEdgeRepetitionCount;
  const rightToLeft =
    layout.direction === "TBRL" || layout.direction === "BTRL";
  const bottomToTop =
    layout.direction === "BTLR" || layout.direction === "BTRL";

  const xOrig = rightToLeft ? parentContainer.visualspace.width - width : 0;
  const xInc = rightToLeft ? -1.0 * width : width;
  // `BTLR` has always measured its origin from the *remaining* edge rather than
  // the box height it is offsetting; kept as it is, since every chart drawn
  // bottom-to-top-then-right sits where it does because of it.
  const yOrig = bottomToTop
    ? parentContainer.visualspace.height - edgeInfo.remainingEdgeSideUnitLength
    : 0;
  const yInc = bottomToTop ? -1.0 * height : height;

  childContainers.forEach(function (c, i) {
    c.visualspace.width = width;
    c.visualspace.height = height;
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
  // The boxes run across (or back along) a row and the rows stack down y, so
  // the filling edge is the width and the remaining edge the height.
  const width = edgeInfo.fillingEdgeSideUnitLength;
  const height = edgeInfo.remainingEdgeSideUnitLength;
  const numHoriElement = edgeInfo.fillingEdgeRepetitionCount;
  const rightToLeft =
    layout.direction === "RLTB" || layout.direction === "RLBT";
  const bottomToTop =
    layout.direction === "LRBT" || layout.direction === "RLBT";

  const xOrig = rightToLeft ? parentContainer.visualspace.width - width : 0;
  const xInc = rightToLeft ? -1.0 * width : width;
  const yOrig = bottomToTop
    ? parentContainer.visualspace.height - height
    : 0;
  const yInc = bottomToTop ? -1.0 * height : height;

  childContainers.forEach(function (c, i) {
    c.visualspace.width = width;
    c.visualspace.height = height;
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
    case "custom": {
      // The same quantity the two above are: the area of the largest box of
      // this level's aspect ratio that the container can hold. `square` and
      // `parent` are the r = 1 and r = width/height cases of it.
      const ratio = customAspectRatio(layout);
      const fittedWidth = Math.min(containerwidth, containerheight * ratio);
      return (fittedWidth * fittedWidth) / ratio;
    }
    default:
      return NaN;
  }
}

/**
 * The `width / height` a `custom` level draws its boxes at.
 *
 * There is no sensible ratio to fall back on -- the whole point of `custom` is
 * that the spec supplies one -- so a level that asks for it without saying which
 * is an error rather than a chart of unsized boxes.
 */
export function customAspectRatio(layout: Layout): number {
  const ratio = layout.custom_aspect_ratio;
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0) {
    throw new Error(
      'unit-vis: aspect_ratio "custom" needs a positive `custom_aspect_ratio` ' +
        `on the same layout, got ${JSON.stringify(ratio)}`,
    );
  }
  return ratio;
}

/** The `width / height` of one box at a packing level. */
export function unitAspectRatio(
  parentContainer: Container,
  layout: Layout,
): number {
  switch (layout.aspect_ratio) {
    case "square":
      return 1;
    case "parent":
      return (
        parentContainer.visualspace.width / parentContainer.visualspace.height
      );
    case "custom":
      return customAspectRatio(layout);
    default:
      return NaN;
  }
}

/** Everything `shelf.ts` needs to pack one container's children. */
export function weightedPackFor(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): WeightedPack {
  return {
    values: childContainers.map((c) => getValue(c, layout)),
    width: parentContainer.visualspace.width,
    height: parentContainer.visualspace.height,
    padding: parentContainer.visualspace.padding,
    margin: layout.margin!,
    ratio: unitAspectRatio(parentContainer, layout),
    direction: layout.direction!,
  };
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

/**
 * A weighted packing level: each child gets a box of `unitLength * value` area
 * at the level's aspect ratio, and the boxes are shelved into the parent.
 *
 * The unit is decided by the caller, since a shared level takes the smallest one
 * any container in its sharing group could use and an isolated one fits its own
 * parent -- see `weightedPackUnit`.
 */
export function calcPackGridxyVisualSpaceWithUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
  unitLength: number,
): void {
  // A weighted `maxfill` is a treemap, which has already placed these boxes and
  // fills its parent by construction; there is no unit for it to re-apply.
  if (layout.aspect_ratio === "maxfill") {
    return;
  }

  const rects = weightedPackRects(
    weightedPackFor(parentContainer, childContainers, layout),
    unitLength,
  );

  childContainers.forEach(function (c, i) {
    c.visualspace.width = rects[i].width;
    c.visualspace.height = rects[i].height;
    c.visualspace.posX = rects[i].x;
    c.visualspace.posY = rects[i].y;
    c.visualspace.padding = layout.padding!;
  });
}

/** The largest unit a weighted packing level can give this container. */
export function calcPackGridxyUnitLength(
  parentContainer: Container,
  childContainers: Container[],
  layout: Layout,
): number {
  return weightedPackUnit(
    weightedPackFor(parentContainer, childContainers, layout),
  );
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
