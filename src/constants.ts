export const defaultLayout = {
  type: 'gridxy',
  aspect_ratio: 'maxfill',
  size: {
    type: 'uniform',
    isShared: true,
  },
  direction: 'LRBT',
  align: 'LB',
  margin: {
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  padding: {
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  box: {
    fill: 'white',
    stroke: 'gray',
    'stroke-width': 1,
    opacity: 0.5,
  },
  sort: {
    type: 'categorical',
    key: 'survived',
    direction: 'ascending',
  },
};

export const defaultWidth = 720;
export const defaultHeight = 480;

export const defaultMark = {
  shape: 'circle',
  color: {
    type: 'uniform',
  },
  size: {
    type: 'max',
    isShared: false,
  },
  isColorScaleShared: true,
};

export const defaultPadding = {
  top: 0,
  left: 0,
  bottom: 0,
  right: 0,
};

export const defaultSetting = {
  layout: {
    box: {
      fill: 'blue',
      stroke: 'black',
      'stroke-width': 1,
      opacity: 0.03,
    },
  },
};
