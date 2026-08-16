import { bin, extent, linearScale, range } from "./array.js";
import type { Bin } from "./array.js";
import {
  asRow,
  emptyContainersFromKeys,
  getSharingAncestorContainer,
  isContainer,
} from "./utils.js";
import type {
  Container,
  ContainerChild,
  Layout,
  Spec,
  VisualSpace,
} from "./types.js";

/**
 * A run of rows headed for one child container. `bin` produces this shape
 * already; the leading group of rows with no value for the binned key is
 * assembled by hand to match.
 */
type RowGroup = ContainerChild[] & { x0?: number; x1?: number };

export function buildRootContainer(csvData: ContainerChild[], spec: Spec): Container {
  if (!Object.hasOwn(spec, "padding")) {
    spec.padding = {
      top: 10,
      left: 30,
      bottom: 30,
      right: 10,
    };
  }
  const myContainer: Container = {
    contents: csvData,
    label: "root",
    visualspace: {
      width: spec.width!,
      height: spec.height!,
      posX: 0,
      posY: 0,
      padding: spec.padding!,
    },
    layout: "StartOfLayout",
    parent: "RootContainer",
  };

  return myContainer;
}

function blankVisualSpace(): VisualSpace {
  return {
    width: 0,
    height: 0,
    posX: 0,
    posY: 0,
    padding: { left: 0, right: 0, top: 0, bottom: 0 },
  };
}

function makeContainersForCategoricalVar(
  sharingDomain: ContainerChild[],
  container: Container,
  layout: Layout,
): Container[] {
  const key = layout.subgroup.key!;
  const newContainers = emptyContainersFromKeys(sharingDomain, key);

  newContainers.forEach(function (c: Container) {
    c.contents = container.contents.filter(function (d) {
      return asRow(d)[key] == c.label;
    });
    c.parent = container;
  });
  return newContainers;
}

function makeContainersForNumericalVar(
  sharingDomain: ContainerChild[],
  container: Container,
  layout: Layout,
): Container[] {
  const subgroup = layout.subgroup;
  const key = subgroup.key!;
  const numBin = subgroup.numBin!;

  const [low, high] = extent(sharingDomain, (d) => Number(asRow(d)[key]));
  // An empty domain leaves the bin edges unusable; carrying the NaN through is
  // what the scale would have produced anyway.
  const extentVal: [number, number] = [low ?? NaN, high ?? NaN];

  const tempScale = linearScale([0, numBin], extentVal);
  const tickArray = range(numBin + 1).map(tempScale);

  const nullGroup: RowGroup = container.contents.filter(function (d) {
    return asRow(d)[key] == "";
  });

  const valueGroup = container.contents.filter(function (d) {
    return asRow(d)[key] != "";
  });

  const bins: Bin<ContainerChild>[] = bin<ContainerChild>(valueGroup, {
    domain: extentVal,
    thresholds: tickArray,
    value: function (d) {
      return Number(asRow(d)[key]);
    },
  });

  // The rows with no value for `key` lead the bins as a group of their own.
  const groups: RowGroup[] = [nullGroup, ...bins];

  return groups.map(function (d) {
    return {
      contents: d,
      label: `${d.x0}-${d.x1}`,
      visualspace: blankVisualSpace(),
      parent: container,
      layout: null,
    };
  });
}

function makeContainersForPassthrough(container: Container): Container[] {
  return [
    {
      contents: container.contents,
      label: container.label,
      visualspace: blankVisualSpace(),
      parent: container,

      layout: null,
    },
  ];
}

function makeContainersForFlatten(
  container: Container,
  layout: Layout,
): Container[] {
  const leaves: Container[] = container.contents.map(function (c, i) {
    return {
      contents: [c],
      label: i,
      visualspace: blankVisualSpace(),
      parent: container,
      layout: null,
    };
  });

  const sort = layout.sort;
  if (sort) {
    leaves.sort(function (a, b) {
      const rawA = asRow(a.contents[0])[sort.key];
      const rawB = asRow(b.contents[0])[sort.key];
      const aValue = sort.type === "numerical" ? Number(rawA) : rawA;
      const bValue = sort.type === "numerical" ? Number(rawB) : rawB;

      const ascending = sort.direction === "ascending" ? 1 : -1;

      // Field values are compared with the raw `>` the grammar has always used,
      // which orders mixed scalars by javascript's own rules.
      return (aValue as number) > (bValue as number)
        ? ascending
        : -1 * ascending;
    });
  }

  return leaves;
}

export function getSharingDomain(node: ContainerChild): ContainerChild[] {
  if (isContainer(node)) {
    const leafs: ContainerChild[] = [];
    node.contents.forEach(function (c) {
      const newLeaves = getSharingDomain(c);

      newLeaves.forEach(function (d) {
        leafs.push(d);
      });
    });
    return leafs;
  } else {
    return [node];
  }
}

export function makeContainers(
  container: Container,
  layout: Layout,
): Container[] {
  const sharingAncestorContainer = getSharingAncestorContainer(
    container,
    layout,
    "subgroup",
  );

  const sharingDomain = getSharingDomain(sharingAncestorContainer);

  switch (layout && layout.subgroup && layout.subgroup.type) {
    case "groupby":
      return makeContainersForCategoricalVar(sharingDomain, container, layout);
    case "bin":
      return makeContainersForNumericalVar(sharingDomain, container, layout);
    case "passthrough":
      return makeContainersForPassthrough(container);
    case "flatten":
      return makeContainersForFlatten(container, layout);
    default:
      return [];
  }
}
