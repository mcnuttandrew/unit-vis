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
  mark?: {
    color: {
      key: string;
      type: string;
    };
    shape?: 'circle' | 'rect';
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
 * A layout stage
 */
export interface Layout {
  subgroup: {
    type: string;
    key?: string;
    numBin?: number;
    aspect_ratio?: number;
  };
  aspect_ratio?: string;
  parent?: string | Layout;
  child?: string | Layout;
  size?: {
    isShared?: boolean;
    type?: string;
    key?: string;
  };
  name?: string;
  box?: {
    opacity?: number;
    fill?: string;
    stroke?: string;
    'stroke-width'?: string;
  };
  type?: string;
  [x: string]: any;
  sizeSharingGroup?: any;
}

export interface DataRow {
  [x: string]: any;
}
export interface Container {
  contents: any[];
  label: string;
  visualspace: {
    width: number;
    height: number;
    posX: number;
    posY: number;
    padding: Padding;
  };
  layout: string | Layout;
  parent: string | Layout;
  [x: string]: any;
}

export interface EdgeInfo {
  remainingEdgeSideUnitLength: number;
  fillingEdgeSideUnitLength: number;
  fillingEdgeRepetitionCount: number;
}
