/**
 * The unit-vis grammar and its layout engine, with no renderer attached and no
 * runtime dependencies.
 *
 * A chart is built in two halves: this package turns a spec plus its data into
 * a tree of boxes (`loadScene`), and a backend package draws that tree. Install
 * `unit-vis` for the d3 backend or `unit-vis-vega` for the vega one -- both
 * re-export everything here, so a consumer rarely depends on it directly.
 */
export {applyDefault} from './defaults.js';
export {buildScene, loadScene} from './scene.js';
export type {Scene} from './scene.js';
export {buildRootContainer, getSharingDomain, makeContainers} from './container.js';
export {applyLayout, buildLayoutList} from './layout.js';
export {default as treemapMultidimensional} from './treemap.js';
export {weightedPackRects, weightedPackUnit} from './shelf.js';
export type {Rect, WeightedPack} from './shelf.js';
export {fetchData, parseCsv, parseCsvRows} from './data.js';
export {asRow, getMarkValue, isContainer, markSumKey} from './utils.js';
export {max, min} from './array.js';
export {
  defaultSetting,
  defaultLayout,
  defaultMark,
  defaultPadding,
  defaultWidth,
  defaultHeight,
} from './constants.js';

export type {
  Align,
  Container,
  ContainerChild,
  DataRow,
  DataValue,
  Direction,
  EdgeInfo,
  Labels,
  Layout,
  Legend,
  Mark,
  MarkContent,
  Padding,
  Schemes,
  SizePolicies,
  Spec,
  Title,
  VisualSpace,
  aspectRatio,
  layoutTypes,
} from './types.js';
