/**
 * A minimal SVG path sampler.
 *
 * The vega backend renders every mark as a <path> (rects become `M..h..v..Z`,
 * circles become arc segments), while the old d3 backend renders <rect> and
 * <circle> elements. To compare the two we reduce paths to sampled points and
 * take their bounding box.
 */

const COMMAND = /([astvzqmhlc])([^astvzqmhlc]*)/gi;
const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

const ARG_COUNT: {[cmd: string]: number} = {a: 7, c: 6, h: 1, l: 2, m: 2, q: 4, s: 4, t: 2, v: 1, z: 0};

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function parseArgs(source: string): number[] {
  const matches = source.match(NUMBER);
  return matches ? matches.map(Number) : [];
}

/** Split a path string into [command, ...args] chunks, honoring implicit repeats. */
function tokenize(d: string): Array<{command: string; args: number[]}> {
  const out: Array<{command: string; args: number[]}> = [];
  let match: RegExpExecArray | null;
  COMMAND.lastIndex = 0;
  while ((match = COMMAND.exec(d))) {
    const command = match[1];
    const args = parseArgs(match[2]);
    const size = ARG_COUNT[command.toLowerCase()];
    if (size === 0) {
      out.push({command, args: []});
      continue;
    }
    for (let i = 0; i < args.length; i += size) {
      // An implicit repeat of `m`/`M` is a lineto, per the SVG spec.
      const repeated = i > 0 && command.toLowerCase() === 'm';
      out.push({command: repeated ? (command === 'm' ? 'l' : 'L') : command, args: args.slice(i, i + size)});
    }
  }
  return out;
}

function sampleCubic(p0: Point, p1: Point, p2: Point, p3: Point, steps = 16): Point[] {
  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return pts;
}

function sampleQuadratic(p0: Point, p1: Point, p2: Point, steps = 12): Point[] {
  return sampleCubic(
    p0,
    {x: p0.x + (2 / 3) * (p1.x - p0.x), y: p0.y + (2 / 3) * (p1.y - p0.y)},
    {x: p2.x + (2 / 3) * (p1.x - p2.x), y: p2.y + (2 / 3) * (p1.y - p2.y)},
    p2,
    steps,
  );
}

/** Endpoint -> center parameterization of an SVG elliptical arc, then sample it. */
function sampleArc(
  p0: Point,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: number,
  sweep: number,
  p1: Point,
  steps = 24,
): Point[] {
  if (p0.x === p1.x && p0.y === p1.y) {
    return [];
  }
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return [p1];
  }
  const phi = (rotationDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coefficient = sign * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (coefficient * (rx * y1p)) / ry;
  const cyp = (coefficient * -(ry * x1p)) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    const value = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    return ux * vy - uy * vx < 0 ? -value : value;
  };
  const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) {
    delta -= 2 * Math.PI;
  } else if (sweep && delta < 0) {
    delta += 2 * Math.PI;
  }

  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = theta + (delta * i) / steps;
    pts.push({
      x: cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi,
      y: cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi,
    });
  }
  return pts;
}

/** Sample every point along a path definition, in user space of that path. */
export function samplePath(d: string): Point[] {
  const points: Point[] = [];
  let current: Point = {x: 0, y: 0};
  let start: Point = {x: 0, y: 0};
  let previousControl: Point | null = null;

  for (const {command, args} of tokenize(d)) {
    const rel = command === command.toLowerCase();
    const base = rel ? current : {x: 0, y: 0};
    const upper = command.toUpperCase();
    let control: Point | null = null;

    switch (upper) {
      case 'M':
        current = {x: base.x + args[0], y: base.y + args[1]};
        start = current;
        break;
      case 'L':
        current = {x: base.x + args[0], y: base.y + args[1]};
        break;
      case 'H':
        current = {x: base.x + args[0], y: current.y};
        break;
      case 'V':
        current = {x: current.x, y: base.y + args[0]};
        break;
      case 'C': {
        const c1 = {x: base.x + args[0], y: base.y + args[1]};
        const c2 = {x: base.x + args[2], y: base.y + args[3]};
        const end = {x: base.x + args[4], y: base.y + args[5]};
        points.push(...sampleCubic(current, c1, c2, end));
        control = c2;
        current = end;
        break;
      }
      case 'S': {
        const c1: Point = previousControl ? {x: 2 * current.x - previousControl.x, y: 2 * current.y - previousControl.y} : current;
        const c2 = {x: base.x + args[0], y: base.y + args[1]};
        const end = {x: base.x + args[2], y: base.y + args[3]};
        points.push(...sampleCubic(current, c1, c2, end));
        control = c2;
        current = end;
        break;
      }
      case 'Q': {
        const c1 = {x: base.x + args[0], y: base.y + args[1]};
        const end = {x: base.x + args[2], y: base.y + args[3]};
        points.push(...sampleQuadratic(current, c1, end));
        control = c1;
        current = end;
        break;
      }
      case 'T': {
        const c1: Point = previousControl ? {x: 2 * current.x - previousControl.x, y: 2 * current.y - previousControl.y} : current;
        const end = {x: base.x + args[0], y: base.y + args[1]};
        points.push(...sampleQuadratic(current, c1, end));
        control = c1;
        current = end;
        break;
      }
      case 'A': {
        const end = {x: base.x + args[5], y: base.y + args[6]};
        points.push(...sampleArc(current, args[0], args[1], args[2], args[3], args[4], end));
        current = end;
        break;
      }
      case 'Z':
        current = start;
        break;
      default:
        break;
    }
    points.push(current);
    previousControl = control;
  }
  return points;
}

export function boundingBox(points: Point[]): Box | null {
  if (!points.length) {
    return null;
  }
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y};
}

/**
 * Classify a path by the commands it uses: vega writes circles/arcs with `A`
 * and rectangles as axis-aligned `h`/`v` runs.
 */
export function classifyPath(d: string): 'circle' | 'rect' | 'path' {
  const commands = tokenize(d).map(t => t.command.toLowerCase());
  if (commands.includes('a')) {
    return 'circle';
  }
  if (commands.every(c => c === 'm' || c === 'h' || c === 'v' || c === 'z')) {
    return 'rect';
  }
  return 'path';
}
