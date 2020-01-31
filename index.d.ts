/**
 *  Size of padding internal padding for layout
 */
interface Padding {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/**
 * A specification of the unit vis grammar
 */
export interface Spec {
  /**
   * The title of the rendered chart, currently unused
   */
  title?: string;
  /**
   * The data source for the input values, either points to a csv or to json array of values
   */
  data: {
    url?: string; //url
    values?: DataRow[];
  };

  /**
   * The specification for how the points should be laid out in space
   */
  layouts: Layout[];

  /**
   * The mark to be shown, defaults to circle
   */
  mark: {
    color: {
      key: string;
      type: 'categorical';
    };
    size: 'uniform' | 'count' | 'sum';

    /**
     * The final share to be shown, either circle or rect
     */
    shape: 'circle' | 'rect';
  };

  /**
   * The height of the output
   */
  height?: number;
  /**
   * The width of the output
   */
  width?: number;
  /**
   * Size of padding internal padding for layout, defaults to zeroes
   */
  padding?: Padding;
}

/**
 * The allowed directions. Allowed: 'BT', 'BTLR', 'BTRL', 'LR', 'LRBT', 'LRTB', 'RL', 'RLBT', 'RLTB', 'TB', 'TBLR', 'TBRL'
 */
export type Direction =
  | 'BT'
  | 'BTLR'
  | 'BTRL'
  | 'LR'
  | 'LRBT'
  | 'LRTB'
  | 'RL'
  | 'RLBT'
  | 'RLTB'
  | 'TB'
  | 'TBLR'
  | 'TBRL';

/**
 * The allowed directions. Allowed: bottom center middle right top CB CM CT LB LM LT RB RM RT left
 */
export type Align =
  | 'bottom'
  | 'center'
  | 'middle'
  | 'right'
  | 'top'
  | 'CB'
  | 'CM'
  | 'CT'
  | 'LB'
  | 'LM'
  | 'LT'
  | 'RB'
  | 'RM'
  | 'RT'
  | 'left';

/**
 * The allowed types of layouts, options include flatten, groupby, bin, passthrough, gridxy
 */
export type layoutTypes = 'flatten' | 'groupby' | 'bin' | 'passthrough' | 'gridxy';

/**
 * The allowed aspect ratios. Includes square, parents, fillX, fillY, maxfill, and custom.
 */
export type aspectRatio = 'square' | 'parent' | 'fillX' | 'fillY' | 'maxfill' | 'custom';

/**
 * A layout stage
 */
export interface Layout {
  subgroup: {
    type: layoutTypes;
    key?: string;
    numBin?: number;
    aspect_ratio?: number;
    isShared?: boolean;
  };
  aspect_ratio?: aspectRatio;
  parent?: string | Layout;
  child?: string | Layout;
  size: {
    isShared: boolean;
    type: 'uniform' | 'sum' | 'count';
    key: string;
  };
  name?: string;
  box?: {
    opacity?: number;
    fill?: string;
    stroke?: string;
    'stroke-width'?: string;
  };
  type?: layoutTypes;
  sizeSharingGroup?: any;
  padding?: Padding;
  margin?: Padding;
  direction?: Direction;
  align?: Align;
  containers?: Container[];
  sort?: {
    key: string;
    type: 'numerical';
    direction: 'ascending' | 'descending';
  };
}

export interface DataRow {
  [x: string]: any;
}
export type VisualSpace = {
  width: number;
  height: number;
  posX: number;
  posY: number;
  padding: Padding;
};
export interface Container {
  contents: any[];
  label: 'root' | string | number;
  visualspace: VisualSpace;
  layout: string | Layout | null;
  parent: string | Layout | Container | null;
  x0?: number;
  x1?: number;
}

export interface EdgeInfo {
  remainingEdgeSideUnitLength: number;
  fillingEdgeSideUnitLength: number;
  remainingEdgeRepetitionCount: number;
  fillingEdgeRepetitionCount: number;
}
