import {Spec} from '../../index.d';
const spec: Spec = {
  title: 'Titanic',
  data: {
    url: 'data/titanic3.csv',
  },
  width: 1000,
  height: 320,
  padding: {
    top: 5,
    left: 5,
    bottom: 5,
    right: 5,
  },
  layouts: [
    {
      name: 'layout1',
      type: 'gridxy',
      subgroup: {
        type: 'groupby',
        key: 'pclass',
        isShared: false,
      },
      aspect_ratio: 'fillX',
      size: {
        type: 'uniform',
        isShared: true,
      },
      direction: 'LRBT',
      align: 'LB',
      margin: {
        top: 5,
        left: 5,
        bottom: 5,
        right: 5,
      },
      padding: {
        top: 5,
        left: 5,
        bottom: 5,
        right: 5,
      },
      box: {
        fill: 'blue',
        stroke: 'black',
        'stroke-width': 1,
        opacity: 0.3,
      },
      sort: {
        key: 'pclass',
        direction: 'ascending',
      },
    },
    {
      name: 'layout2',
      type: 'gridxy',
      subgroup: {
        type: 'bin',
        key: 'age',
        numBin: 19,
        isShared: true,
      },
      aspect_ratio: 'fillY',
      size: {
        type: 'uniform',
        isShared: true,
      },
      direction: 'BT',
      align: 'bottom',
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
        fill: 'green',
        stroke: 'red',
        'stroke-width': 1,
        opacity: 0.5,
      },
      sort: {
        key: 'age',
        direction: 'ascending',
      },
    },
    {
      name: 'layout3',
      type: 'gridxy',
      subgroup: {
        type: 'passthrough',
        isShared: true,
      },
      aspect_ratio: 'fillX',
      size: {
        type: 'count',
        isShared: true,
      },
      direction: 'LR',
      align: 'center',
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
        fill: 'yellow',
        stroke: 'blue',
        'stroke-width': 1,
        opacity: 0.5,
      },
    },
    {
      name: 'layout4',
      type: 'gridxy',
      subgroup: {
        type: 'flatten',
      },
      aspect_ratio: 'maxfill',
      size: {
        type: 'uniform',
        isShared: false,
      },
      direction: 'BTLR',
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
        fill: 'yellow',
        stroke: 'red',
        'stroke-width': 0,
        opacity: 0.5,
      },
      sort: {
        type: 'categorical',
        key: 'survived',
        direction: 'ascending',
      },
    },
  ],
  mark: {
    shape: 'circle',
    color: {
      key: 'survived',
      type: 'categorical',
    },
    size: {
      type: 'max',
      isShared: false,
    },
    isColorScaleShared: true,
  },
  $schema: 'https://unit-vis.netlify.com/assets/unit-vis-schema.json',
};
export default spec;
