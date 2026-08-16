import {defaultLayout, defaultWidth, defaultHeight, defaultMark, defaultPadding} from './constants';
import type {Spec} from './index.d';

/**
 * Filling a spec in is a structural copy across two plain objects rather than
 * anything `Spec` can describe: the defaults are deliberately partial (their
 * `mark.color` has no `key`, for one), and the pass writes properties into
 * whatever it is handed. So the spec is treated as an open record for the
 * length of it, and typed again by its callers.
 */
type OpenObject = Record<string, unknown>;

function applyDefaultObj(specObj: OpenObject, defaultObj: OpenObject): void {
  for (const prop in defaultObj) {
    specObj[prop] = Object.hasOwn(specObj, prop) ? specObj[prop] : defaultObj[prop];
    if (typeof specObj[prop] === 'object') {
      applyDefaultObj(specObj[prop] as OpenObject, defaultObj[prop] as OpenObject);
    }
  }
}

export function applyDefault(spec: Spec): void {
  const open = spec as unknown as OpenObject;

  open.mark = open.mark ? open.mark : defaultMark;

  applyDefaultObj(open.mark as OpenObject, defaultMark);

  open.padding = open.padding ? open.padding : defaultPadding;
  open.width = open.width ? open.width : defaultWidth;
  open.height = open.height ? open.height : defaultHeight;
  const layouts = (open.layouts as OpenObject[] | undefined) || [];
  const numLayouts = layouts.length;
  for (let i = 0; i < numLayouts; i++) {
    const layout = layouts[i];

    applyDefaultObj(layout, defaultLayout);

    const subgroup = layout.subgroup as OpenObject | undefined;
    if (subgroup && subgroup.type === 'flatten') {
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
    const firstLayout = layouts[0];

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
