import {
  extent,
  range,
  // @ts-ignore
  bin,
} from 'd3-array';
import {scaleLinear} from 'd3-scale';
import {emptyContainersFromKeys, getSharingAncestorContainer, isContainer} from './utils';
import {DataRow, Spec, Container, Layout, VisualSpace} from '../index.d';
export function buildRootContainer(csvData: DataRow[], spec: Spec): Container {
  if (!spec.hasOwnProperty('padding')) {
    spec.padding = {
      top: 10,
      left: 30,
      bottom: 30,
      right: 10,
    };
  }
  const myContainer: Container = {
    contents: csvData,
    label: 'root',
    visualspace: {
      width: spec.width,
      height: spec.height,
      posX: 0,
      posY: 0,
      padding: spec.padding,
    },
    layout: 'StartOfLayout',
    parent: 'RootContainer',
  };

  return myContainer;
}

function blankVisualSpace(): VisualSpace {
  return {
    width: 0,
    height: 0,
    posX: 0,
    posY: 0,
    padding: {left: 0, right: 0, top: 0, bottom: 0},
  };
}

function makeContainersForCategoricalVar(
  sharingDomain: Container[],
  container: Container,
  layout: Layout,
): Container[] {
  const newContainers = emptyContainersFromKeys(sharingDomain, layout.subgroup.key);

  newContainers.forEach(function(c: Container) {
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
): Container[] {
  const subgroup = layout.subgroup;

  const extentVal = extent(sharingDomain, (d: any) => {
    console.log(subgroup.key);
    return Number(d[subgroup.key]);
  });

  const tempScale = scaleLinear()
    .domain([0, subgroup.numBin])
    .range(extentVal);
  const tickArray = range(subgroup.numBin + 1).map(tempScale);

  let nullGroup: any = container.contents.filter(function(d) {
    return d[subgroup.key] == '';
  });

  const valueGroup = container.contents.filter(function(d) {
    return d[subgroup.key] != '';
  });

  const bins = bin()
    .domain(extentVal)
    .thresholds(tickArray)
    .value(function(d: any) {
      return +d[subgroup.key];
    })(valueGroup);

  nullGroup = [nullGroup];
  nullGroup.x0 = '';
  nullGroup.x1 = '';

  return nullGroup.concat(bins).map(function(d: Container) {
    return {
      contents: d,
      label: `${d.x0}-${d.x1}`,
      visualspace: {},
      parent: container,
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

function makeContainersForFlatten(container: Container, layout: Layout): Container[] {
  const leaves = container.contents.map(function(c, i) {
    return {
      contents: [c],
      label: i,
      visualspace: blankVisualSpace(),
      parent: container,
      layout: null,
    };
  });

  if (layout.hasOwnProperty('sort')) {
    leaves.sort(function(a, b) {
      let Avalue = a.contents[0][layout.sort.key];
      let Bvalue = b.contents[0][layout.sort.key];

      if (layout.sort.type === 'numerical') {
        Avalue = Number(Avalue);
        Bvalue = Number(Bvalue);
      }

      const ascending = layout.sort.direction === 'ascending' ? 1 : -1;

      return Avalue > Bvalue ? ascending : -1 * ascending;
    });
  }

  return leaves;
}

export function getSharingDomain(container: Container): Container[] {
  if (isContainer(container)) {
    const leafs: Container[] = [];
    container.contents.forEach(function(c) {
      const newLeaves = getSharingDomain(c);

      newLeaves.forEach(function(d) {
        leafs.push(d);
      });
    });
    return leafs;
  } else {
    return [container];
  }
}

export function makeContainers(container: Container, layout: Layout): Container[] {
  const sharingAncestorContainer = getSharingAncestorContainer(container, layout, 'subgroup');

  const sharingDomain = getSharingDomain(sharingAncestorContainer);
  let childContainers;

  switch (layout && layout.subgroup && layout.subgroup.type) {
    case 'groupby':
      childContainers = makeContainersForCategoricalVar(sharingDomain, container, layout);
      break;
    case 'bin':
      childContainers = makeContainersForNumericalVar(sharingDomain, container, layout);
      break;
    case 'passthrough':
      childContainers = makeContainersForPassthrough(container);
      break;
    case 'flatten':
      childContainers = makeContainersForFlatten(container, layout);
      break;
  }

  return childContainers;
}
