import {Spec} from '../../index.d';
const spec: Spec = {
  title: 'Titanic',
  data: {
    url: 'data/titanic3.csv',
  },
  width: 500,
  height: 240,
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
        key: 'age',
        type: 'bin',
        numBin: 15,
        isShared: false,
      },
      aspect_ratio: 'parent',
      size: {
        type: 'uniform',
        isShared: false,
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
        fill: 'none',
        stroke: 'black',
        'stroke-width': 0,
        opacity: 0.3,
      },
    },
    {
      name: 'layout2',
      type: 'gridxy',
      subgroup: {
        type: 'groupby',
        key: 'pclass',
        isShared: false,
      },
      aspect_ratio: 'fillX',
      size: {
        type: 'uniform',
        isShared: false,
      },
      direction: 'LRTB',
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
        fill: 'none',
        stroke: 'green',
        'stroke-width': 1,
        opacity: 0.5,
      },
    },
    {
      name: 'layout3',
      type: 'gridxy',
      subgroup: {
        type: 'flatten',
      },
      aspect_ratio: 'square',
      size: {
        type: 'uniform',
        isShared: false,
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
        fill: 'none',
        stroke: 'black',
        'stroke-width': 1,
        opacity: 1,
      },
      sort: {
        key: 'survived',
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
