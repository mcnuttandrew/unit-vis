import {Spec} from '../../index.d';
const spec: Spec = {
  title: 'Titanic',
  data: {
    url: 'data/titanic3.csv',
  },
  width: 320,
  height: 240,
  padding: {
    top: 10,
    left: 30,
    bottom: 30,
    right: 10,
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
    },
    {
      name: 'layout2',
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
        top: 10,
        left: 30,
        bottom: 30,
        right: 10,
      },
      padding: {
        top: 10,
        left: 30,
        bottom: 30,
        right: 10,
      },
      sort: {
        key: 'survived',
      },
    },
  ],
  mark: {
    shape: 'rect',
    color: {
      key: 'survived',
      type: 'categorical',
    },
    size: {
      type: 'max',
      isShared: true,
    },
    isColorScaleShared: true,
  },
  $schema: 'https://unit-vis.netlify.com/assets/unit-vis-schema.json',
};

export default spec;
