import {Spec} from '../../index.d';
const spec: Spec = {
  title: 'Titanic',
  data: {
    url: 'data/titanic3.csv',
  },
  width: 640,
  height: 480,
  padding: {
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
  },
  layouts: [],
  mark: {
    shape: 'circle',
    color: {
      key: 'survived',
      type: 'categorical',
      isShared: true,
    },
    size: {
      type: 'max',
      isShared: false,
    },
  },
  $schema: 'https://unit-vis.netlify.com/assets/unit-vis-schema.json',
};

export default spec;
