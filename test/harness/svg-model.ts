/**
 * Reduce the SVG produced by either backend to a backend-independent list of
 * drawn primitives, in absolute canvas coordinates.
 *
 * The two backends emit very different markup:
 *   old   -> nested <g transform="translate(..)"> with <rect>/<circle> children
 *   vega  -> flat <g class="mark-rect role-mark unitMarks"> with <path> children
 * Everything below flattens both into the same `Primitive` shape so the
 * comparison code never has to care which renderer produced the document.
 */
import {color as parseColor} from 'd3-color';
import {JSDOM} from 'jsdom';
import {boundingBox, classifyPath, samplePath} from './path-geometry';

/** A unit mark is one datum; a box is a layout container's background rect. */
export type Role = 'unit' | 'box';

export interface Primitive {
  role: Role;
  shape: 'circle' | 'rect' | 'path';
  /** Absolute bounding box on the canvas. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Bounding-box center; the natural anchor for circles. */
  cx: number;
  cy: number;
  /** Half of the bounding-box width, i.e. the radius for circular marks. */
  radius: number;
  fill: string | null;
  fillOpacity: number;
  stroke: string | null;
  strokeWidth: number | null;
  /** Where in the source document this came from, for error messages. */
  source: string;
}

export interface SvgModel {
  width: number;
  height: number;
  units: Primitive[];
  boxes: Primitive[];
  /** Elements we could not classify; a non-empty list is itself a smell. */
  unclassified: string[];
}

interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Matrix = {a: 1, b: 0, c: 0, d: 1, e: 0, f: 0};

function multiply(m: Matrix, n: Matrix): Matrix {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function apply(m: Matrix, x: number, y: number): {x: number; y: number} {
  return {x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f};
}

/** Parse the subset of transform syntax the two backends actually emit. */
export function parseTransform(value: string | null): Matrix {
  if (!value) {
    return IDENTITY;
  }
  let out = IDENTITY;
  const pattern = /(translate|scale|matrix|rotate)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    const args = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    switch (match[1]) {
      case 'translate':
        out = multiply(out, {...IDENTITY, e: args[0] || 0, f: args[1] || 0});
        break;
      case 'scale':
        out = multiply(out, {...IDENTITY, a: args[0] ?? 1, d: args[1] ?? args[0] ?? 1});
        break;
      case 'rotate': {
        const theta = ((args[0] || 0) * Math.PI) / 180;
        out = multiply(out, {a: Math.cos(theta), b: Math.sin(theta), c: -Math.sin(theta), d: Math.cos(theta), e: 0, f: 0});
        break;
      }
      case 'matrix':
        out = multiply(out, {a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5]});
        break;
      default:
        break;
    }
  }
  return out;
}

/** Read a presentation value from the attribute, the style attribute, or inherit. */
function readStyle(el: Element, key: string, inherited: string | null): string | null {
  const styleAttr = el.getAttribute('style');
  if (styleAttr) {
    const match = new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`).exec(styleAttr);
    if (match) {
      return match[1].trim();
    }
  }
  const attr = el.getAttribute(key);
  return attr !== null ? attr : inherited;
}

/** Normalize any CSS color to lowercase hex so the two backends compare. */
export function normalizeColor(value: string | null): string | null {
  if (!value || value === 'none' || value === 'transparent') {
    return null;
  }
  const parsed = parseColor(value);
  return parsed ? parsed.formatHex().toLowerCase() : value.toLowerCase();
}

function numberAttr(el: Element, key: string, fallback = 0): number {
  const raw = el.getAttribute(key);
  return raw === null || raw === '' ? fallback : Number(raw);
}

interface Inherited {
  fill: string | null;
  opacity: string | null;
  stroke: string | null;
  strokeWidth: string | null;
}

function toPrimitive(
  role: Role,
  shape: Primitive['shape'],
  box: {x: number; y: number; width: number; height: number},
  el: Element,
  inherited: Inherited,
  source: string,
): Primitive {
  const opacity = readStyle(el, 'fill-opacity', null) ?? readStyle(el, 'opacity', inherited.opacity);
  return {
    role,
    shape,
    ...box,
    cx: box.x + box.width / 2,
    cy: box.y + box.height / 2,
    radius: box.width / 2,
    fill: normalizeColor(readStyle(el, 'fill', inherited.fill)),
    fillOpacity: opacity === null ? 1 : Number(opacity),
    stroke: normalizeColor(readStyle(el, 'stroke', inherited.stroke)),
    strokeWidth: (() => {
      const raw = readStyle(el, 'stroke-width', inherited.strokeWidth);
      return raw === null ? null : Number.parseFloat(raw);
    })(),
    source,
  };
}

export function parseSvg(svgText: string): Document {
  const dom = new JSDOM(`<!doctype html><body>${svgText}</body>`, {contentType: 'text/html'});
  return dom.window.document;
}

function rootSvg(doc: Document): SVGElement {
  const svg = doc.querySelector('svg');
  if (!svg) {
    throw new Error('no <svg> element was rendered');
  }
  return svg as unknown as SVGElement;
}

/**
 * Old backend: d3 nests one <g> per layout level. Within each group the *first*
 * <rect> is the layout box drawn by `drawUnit`'s layout loop; anything drawn
 * after it is a unit mark.
 */
export function modelFromOldSvg(svgText: string): SvgModel {
  const doc = parseSvg(svgText);
  const svg = rootSvg(doc);
  const units: Primitive[] = [];
  const boxes: Primitive[] = [];
  const unclassified: string[] = [];

  const walk = (el: Element, matrix: Matrix, inherited: Inherited, boxSeen: boolean, path: string): void => {
    let seenBoxHere = boxSeen;
    Array.from(el.children).forEach((child, index) => {
      const local = multiply(matrix, parseTransform(child.getAttribute('transform')));
      const here = `${path}>${child.tagName}[${index}]`;
      const nextInherited: Inherited = {
        fill: readStyle(child, 'fill', inherited.fill),
        opacity: readStyle(child, 'opacity', inherited.opacity),
        stroke: readStyle(child, 'stroke', inherited.stroke),
        strokeWidth: readStyle(child, 'stroke-width', inherited.strokeWidth),
      };
      switch (child.tagName.toLowerCase()) {
        case 'g':
          walk(child, local, nextInherited, false, here);
          break;
        case 'rect': {
          const topLeft = apply(local, numberAttr(child, 'x'), numberAttr(child, 'y'));
          const box = {
            x: topLeft.x,
            y: topLeft.y,
            width: numberAttr(child, 'width'),
            height: numberAttr(child, 'height'),
          };
          // First rect in a group is the layout container drawn by the layout
          // loop; a later rect is the unit mark for `shape: 'rect'`.
          const role: Role = seenBoxHere ? 'unit' : 'box';
          seenBoxHere = true;
          (role === 'unit' ? units : boxes).push(toPrimitive(role, 'rect', box, child, inherited, here));
          break;
        }
        case 'circle': {
          const r = numberAttr(child, 'r');
          const center = apply(local, numberAttr(child, 'cx'), numberAttr(child, 'cy'));
          units.push(
            toPrimitive(
              'unit',
              'circle',
              {x: center.x - r, y: center.y - r, width: 2 * r, height: 2 * r},
              child,
              inherited,
              here,
            ),
          );
          break;
        }
        case 'path': {
          const box = boundingBox(samplePath(child.getAttribute('d') || ''));
          if (box) {
            units.push(toPrimitive('unit', classifyPath(child.getAttribute('d') || ''), box, child, inherited, here));
          }
          break;
        }
        case 'title':
        case 'desc':
        case 'defs':
        case 'style':
          break;
        default:
          unclassified.push(here);
          break;
      }
    });
  };

  walk(svg as unknown as Element, IDENTITY, {fill: null, opacity: null, stroke: null, strokeWidth: null}, false, 'svg');

  return {
    width: numberAttr(svg as unknown as Element, 'width'),
    height: numberAttr(svg as unknown as Element, 'height'),
    units,
    boxes,
    unclassified,
  };
}

/** Mark names set by `buildVegaSpec`; they land in the SVG group's class list. */
const UNIT_MARK_NAMES = new Set(['unitMarks', 'unitArcMarks']);
const BOX_MARK_NAMES = new Set(['containerMarks']);
/**
 * Decorations the vega backend draws when a spec asks for them. They are
 * neither units nor boxes and the old backend has no counterpart, so they are
 * skipped rather than reported as something the model failed to classify.
 * (Legends need no entry: vega gives them `role-legend`, not `role-mark`.)
 */
const DECORATION_MARK_NAMES = new Set(['labelMarks']);

/**
 * Vega backend: marks live in `<g class="mark-<type> role-mark <name>">`, where
 * `<name>` is the mark name set in `buildVegaSpec` (`unitMarks` /
 * `containerMarks`). Group backgrounds are `<path class="background">`.
 */
export function modelFromVegaSvg(svgText: string): SvgModel {
  const doc = parseSvg(svgText);
  const svg = rootSvg(doc);
  const units: Primitive[] = [];
  const boxes: Primitive[] = [];
  const unclassified: string[] = [];

  const markGroups = Array.from(svg.querySelectorAll('g.role-mark'));
  markGroups.forEach(group => {
    const classes = group.getAttribute('class') || '';
    const tokens = classes.split(/\s+/);
    if (tokens.some(t => DECORATION_MARK_NAMES.has(t))) {
      return;
    }
    const role: Role | null = tokens.some(t => UNIT_MARK_NAMES.has(t))
      ? 'unit'
      : tokens.some(t => BOX_MARK_NAMES.has(t))
      ? 'box'
      : null;
    if (!role) {
      unclassified.push(`unnamed mark group: ${classes}`);
      return;
    }
    // Absolute position = every ancestor transform, then the mark's own.
    let ancestor: Element | null = group;
    let matrix = IDENTITY;
    const chain: Element[] = [];
    while (ancestor && ancestor !== (svg as unknown as Element)) {
      chain.unshift(ancestor);
      ancestor = ancestor.parentElement;
    }
    chain.forEach(node => {
      matrix = multiply(matrix, parseTransform(node.getAttribute('transform')));
    });

    Array.from(group.children).forEach((child, index) => {
      const d = child.getAttribute('d') || '';
      const local = multiply(matrix, parseTransform(child.getAttribute('transform')));
      const points = samplePath(d).map(p => apply(local, p.x, p.y));
      const box = boundingBox(points);
      if (!box) {
        unclassified.push(`empty path in ${classes}[${index}]`);
        return;
      }
      const inherited: Inherited = {fill: null, opacity: null, stroke: null, strokeWidth: null};
      (role === 'unit' ? units : boxes).push(
        toPrimitive(role, classifyPath(d), box, child, inherited, `${classes}[${index}]`),
      );
    });
  });

  return {
    width: numberAttr(svg as unknown as Element, 'width'),
    height: numberAttr(svg as unknown as Element, 'height'),
    units,
    boxes,
    unclassified,
  };
}
