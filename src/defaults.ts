import {defaultLayout, defaultWidth, defaultHeight, defaultMark, defaultPadding} from './constants';

function applyDefaultObj(specObj: any, defaultObj: any): void {
  for (const prop in defaultObj) {
    specObj[prop] = specObj.hasOwnProperty(prop) ? specObj[prop] : defaultObj[prop];
    if (typeof specObj[prop] === 'object') {
      applyDefaultObj(specObj[prop], defaultObj[prop]);
    }
  }
}

export function applyDefault(spec: any): void {
  spec.mark = spec.mark ? spec.mark : defaultMark;

  applyDefaultObj(spec.mark, defaultMark);

  spec.padding = spec.padding ? spec.padding : defaultPadding;
  spec.width = spec.width ? spec.width : defaultWidth;
  spec.height = spec.height ? spec.height : defaultHeight;
  const numLayouts = (spec.layouts || []).length;
  for (let i = 0; i < numLayouts; i++) {
    const layout = spec.layouts[i];

    applyDefaultObj(layout, defaultLayout);

    if (layout.subgroup && layout.subgroup.type === 'flatten') {
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

  if (numLayouts > 1) {
    const firstLayout = spec.layouts[0];

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
