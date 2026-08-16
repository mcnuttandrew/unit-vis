/** A box, as `[x0, y0, x1, y1]`. */
type Rect = [number, number, number, number];

/** Weights to lay out: a flat row of areas, or nested rows of them. */
type TreemapData = number[] | NestedTreemapData[];
type NestedTreemapData = number | NestedTreemapData[];

// treemapMultidimensional - takes multidimensional data (aka [[23,11],[11,32]] - nested array)
//                           and recursively calls itself using treemapSingledimensional
//                           to create a patchwork of treemaps and merge them
export default function treemapMultidimensional(
  data: TreemapData,
  width: number,
  height: number,
  xoffset?: number,
  yoffset?: number,
): Rect[] {
  xoffset = typeof xoffset === 'undefined' ? 0 : xoffset;
  yoffset = typeof yoffset === 'undefined' ? 0 : yoffset;

  const mergeddata = [];
  let mergedtreemap;
  let results: Rect[] = [];
  let i;

  if (Array.isArray(data[0])) {
    const nested = data as NestedTreemapData[][];
    // if we've got more dimensions of depth
    for (i = 0; i < nested.length; i++) {
      mergeddata[i] = sumMultidimensionalArray(nested[i]);
    }
    mergedtreemap = treemapSingledimensional(mergeddata, width, height, xoffset, yoffset);

    for (i = 0; i < nested.length; i++) {
      results.push(
        treemapMultidimensional(
          nested[i],
          mergedtreemap[i][2] - mergedtreemap[i][0],
          mergedtreemap[i][3] - mergedtreemap[i][1],
          mergedtreemap[i][0],
          mergedtreemap[i][1],
        ) as unknown as Rect,
      );
    }
  } else {
    results = treemapSingledimensional(data as number[], width, height, xoffset, yoffset);
  }
  return results;
}

// normalize - the Bruls algorithm assumes we're passing in areas that nicely fit into our
//             container box, this method takes our raw data and normalizes the data values into
//             area values so that this assumption is valid.
function normalize(data: number[], area: number): number[] {
  const normalizeddata = [];
  const sum = sumArray(data);
  const multiplier = area / sum;
  let i;

  for (i = 0; i < data.length; i++) {
    normalizeddata[i] = data[i] * multiplier;
  }
  return normalizeddata;
}

// treemapSingledimensional - simple wrapper around squarify
function treemapSingledimensional(
  data: number[],
  width: number,
  height: number,
  xoffset?: number,
  yoffset?: number,
): Rect[] {
  xoffset = typeof xoffset === 'undefined' ? 0 : xoffset;
  yoffset = typeof yoffset === 'undefined' ? 0 : yoffset;

  const rawtreemap = squarify(
    normalize(data, width * height),
    [],
    makeContainer(xoffset, yoffset, width, height),
    [],
  );
  return flattenTreemap(rawtreemap);
}

// flattenTreemap - squarify implementation returns an array of arrays of coordinates
//                  because we have a new array everytime we switch to building a new row
//                  this converts it into an array of coordinates.
function flattenTreemap(rawtreemap: Rect[][]): Rect[] {
  const flattreemap = [];
  let i, j;

  for (i = 0; i < rawtreemap.length; i++) {
    for (j = 0; j < rawtreemap[i].length; j++) {
      flattreemap.push(rawtreemap[i][j]);
    }
  }
  return flattreemap;
}

// squarify  - as per the Bruls paper
//             plus coordinates stack and containers so we get
//             usable data out of it
function squarify(
  data: number[],
  currentrow: number[],
  container: TreemapContainer,
  stack: Rect[][],
): Rect[][] {
  if (data.length === 0) {
    stack.push(container.getCoordinates(currentrow));
    return stack;
  }

  const length = container.shortestEdge();
  const nextdatapoint = data[0];

  if (improvesRatio(currentrow, nextdatapoint, length)) {
    currentrow.push(nextdatapoint);
    squarify(data.slice(1), currentrow, container, stack);
  } else {
    const newcontainer = container.cutArea(sumArray(currentrow));
    stack.push(container.getCoordinates(currentrow));
    squarify(data, [], newcontainer, stack);
  }
  return stack;
}

// improveRatio - implements the worse calculation and comparision as given in Bruls
//                (note the error in the original paper; fixed here)
function improvesRatio(currentrow: number[], nextnode: number, length: number): boolean {
  if (currentrow.length === 0) {
    return true;
  }

  const newrow = currentrow.slice();
  newrow.push(nextnode);

  const currentratio = calculateRatio(currentrow, length);
  const newratio = calculateRatio(newrow, length);

  // the pseudocode in the Bruls paper has the direction of the comparison
  // wrong, this is the correct one.
  return currentratio >= newratio;
}

// calculateRatio - calculates the maximum width to height ratio of the
//                  boxes in this row
function calculateRatio(row: number[], length: number): number {
  const sum = sumArray(row);
  return Math.max(
    (Math.pow(length, 2) * Math.max(...row)) / Math.pow(sum, 2),
    Math.pow(sum, 2) / (Math.pow(length, 2) * Math.min(...row)),
  );
}

// sumArray - sums a single dimensional array
function sumArray(arr: number[]): number {
  let sum = 0;
  let i;

  for (i = 0; i < arr.length; i++) {
    sum += arr[i];
  }
  return sum;
}

// sumMultidimensionalArray - sums the values in a nested array (aka [[0,1],[[2,3]]])
function sumMultidimensionalArray(arr: NestedTreemapData[]): number {
  let i,
    total = 0;

  if (Array.isArray(arr[0])) {
    for (i = 0; i < arr.length; i++) {
      total += sumMultidimensionalArray(arr[i] as NestedTreemapData[]);
    }
  } else {
    total = sumArray(arr as number[]);
  }
  return total;
}

/** The rectangle a row of boxes is being packed into. */
interface TreemapContainer {
  xoffset: number;
  yoffset: number;
  width: number;
  height: number;
  shortestEdge(): number;
  /**
   * For a row of boxes which we've placed, return an array of their cartesian
   * coordinates.
   */
  getCoordinates(row: number[]): Rect[];
  /**
   * Once we've placed some boxes into a row we then need to identify the
   * remaining area. This takes the area of the boxes we've placed and returns a
   * container box defined by the space left over.
   */
  cutArea(area: number): TreemapContainer;
}

function makeContainer(
  xoffset: number, // offset from the the top left hand corner
  yoffset: number, // ditto
  width: number,
  height: number,
): TreemapContainer {
  return {
    xoffset,
    yoffset,
    width,
    height,

    shortestEdge(): number {
      return Math.min(this.height, this.width);
    },

    getCoordinates(row: number[]): Rect[] {
      const coordinates: Rect[] = [];
      let subxoffset = this.xoffset,
        subyoffset = this.yoffset; //our offset within the container
      const areawidth = sumArray(row) / this.height;
      const areaheight = sumArray(row) / this.width;
      let i;

      if (this.width >= this.height) {
        for (i = 0; i < row.length; i++) {
          coordinates.push([
            subxoffset,
            subyoffset,
            subxoffset + areawidth,
            subyoffset + row[i] / areawidth,
          ]);
          subyoffset = subyoffset + row[i] / areawidth;
        }
      } else {
        for (i = 0; i < row.length; i++) {
          coordinates.push([
            subxoffset,
            subyoffset,
            subxoffset + row[i] / areaheight,
            subyoffset + areaheight,
          ]);
          subxoffset = subxoffset + row[i] / areaheight;
        }
      }
      return coordinates;
    },

    cutArea(area: number): TreemapContainer {
      if (this.width >= this.height) {
        const areawidth = area / this.height;
        const newwidth = this.width - areawidth;
        return makeContainer(this.xoffset + areawidth, this.yoffset, newwidth, this.height);
      }
      const areaheight = area / this.width;
      const newheight = this.height - areaheight;
      return makeContainer(this.xoffset, this.yoffset + areaheight, this.width, newheight);
    },
  };
}
