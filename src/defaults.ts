import {
  defaultLayout,
  defaultWidth,
  defaultHeight,
  defaultMark,
  defaultPadding,
} from './constants';

function applyDefaultObj(specObj: any, defaultObj: any) {
  for (var prop in defaultObj) {
    specObj[prop] = specObj.hasOwnProperty(prop)
      ? specObj[prop]
      : defaultObj[prop];
    if (typeof specObj[prop] === 'object') {
      applyDefaultObj(specObj[prop], defaultObj[prop]);
    }
  }
}

export function applyDefault(spec: any) {
  spec.mark = spec.mark ? spec.mark : defaultMark;

  applyDefaultObj(spec.mark, defaultMark);

  spec.padding = spec.padding ? spec.padding : defaultPadding;
  spec.width = spec.width ? spec.width : defaultWidth;
  spec.height = spec.height ? spec.height : defaultHeight;

  for (var i = 0; i < spec.layouts.length; i++) {
    var layout = spec.layouts[i];

    applyDefaultObj(layout, defaultLayout);

    if (layout.subgroup.type === 'flatten') {
      layout.margin = {
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
      };
      layout.box = {
        fill: 'white',
        stroke: 'gray',
        'stroke-width': 0,
        opacity: 0.5,
      };
    }
  }

  if (spec.layouts.length > 1) {
    var firstLayout = spec.layouts[0];

    firstLayout.margin = {
      top: 5,
      left: 5,
      bottom: 5,
      right: 5,
    };

    firstLayout.padding = {
      top: 5,
      left: 5,
      bottom: 5,
      right: 5,
    };
  }
}
