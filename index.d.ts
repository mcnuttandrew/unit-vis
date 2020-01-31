interface Padding {
  /**
   *  Size of padding internal padding for layout
   */
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

export type layoutTypes = 'flatten' | 'groupby' | 'bin' | 'passthrough' | 'gridxy';
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
  aspect_ratio?: string;
  parent?: string | Layout;
  child?: string | Layout;
  size?: {
    isShared?: boolean;
    type?: 'uniform' | 'sum' | 'count';
    key?: string;
  };
  name?: string;
  box?: {
    opacity?: number;
    fill?: string;
    stroke?: string;
    'stroke-width'?: string;
  };
  type?: layoutTypes;
  // [x: string]: any;
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
export interface Container {
  contents: any[];
  label: 'root';
  visualspace: {
    width: number;
    height: number;
    posX: number;
    posY: number;
    padding: Padding;
  };
  layout: string | Layout;
  parent: string | Layout;
  x0?: number;
  x1?: number;
}

export interface EdgeInfo {
  remainingEdgeSideUnitLength: number;
  fillingEdgeSideUnitLength: number;
  fillingEdgeRepetitionCount: number;
}
