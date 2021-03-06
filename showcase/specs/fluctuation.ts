import {Spec} from '../../index.d';
const spec: Spec = {
  title: 'Titanic',
  data: {
    url: 'data/titanic.csv',
  },
  width: 800,
  height: 600,
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
        key: 'Sex',
        isShared: false,
      },
      aspect_ratio: 'fillY',
      size: {
        type: 'uniform',
        isShared: false,
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
    },
    {
      name: 'layout2',
      type: 'gridxy',
      subgroup: {
        type: 'groupby',
        key: 'Class',
        isShared: true,
      },
      aspect_ratio: 'fillX',
      size: {
        type: 'uniform',
        isShared: true,
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
    },
    {
      name: 'layout3',
      type: 'gridxy',
      subgroup: {
        type: 'passthrough',
        isShared: true,
      },
      aspect_ratio: 'square',
      size: {
        type: 'count',
        isShared: true,
      },
      direction: 'LRBT',
      align: 'center',
      margin: {
        top: 1,
        left: 1,
        bottom: 1,
        right: 1,
      },
      padding: {
        top: 2,
        left: 2,
        bottom: 2,
        right: 2,
      },
      box: {
        fill: 'none',
        stroke: 'black',
        'stroke-width': 0,
        opacity: 0.3,
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
      sort: {
        key: 'Survived',
      },
    },
  ],
  mark: {
    shape: 'circle',
    color: {
      key: 'Survived',
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
