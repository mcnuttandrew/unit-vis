/**
 * The layout, compiled to vega transforms.
 *
 * `@unit-vis/core`'s engine walks a container tree in JS and hands a renderer
 * pre-computed boxes. This module does the same job as a dataflow instead: the
 * spec becomes one `data` stage per level of `spec.layouts`, and vega does the
 * subdividing, the sizing and the positioning itself. Nothing but the rows
 * crosses the boundary, so the emitted vega spec is self-contained -- it
 * serializes, it re-runs incrementally when a signal or the data changes, and a
 * transform upstream of the layout (a filter, a selection) reshapes the chart
 * without a round trip through JS.
 *
 * Each level `d` produces a dataset named `level${d}`, one tuple per container,
 * carrying absolute `absX`/`absY`/`width`/`height`, the container's `label`, the
 * composite keys `ck0`..`ck${d}` naming its position in the tree, and `cnt`, the
 * number of rows it holds. `level0` is the canvas. Marks are drawn from the
 * deepest level; boxes from every level.
 *
 * The engine's semantics are reproduced exactly, quirks included -- see the
 * comments at each one. `test/backend-parity.test.ts` holds it to that against
 * the d3 backend, which still draws from the JS engine.
 */
import type {Data as VegaData, Transforms} from 'vega';
import type {DataRow, Layout, Spec} from '@unit-vis/core';

import {TREEMAP_TRANSFORM, registerTreemapTransform} from './treemap-transform.js';

/**
 * Joins the per-level keys into a container's composite key. Any character
 * would do; a control character keeps it clear of real field values.
 */
const SEP = '';

/** Packing directions that fill along x and wrap along y (`isVerticalDirection`). */
const VERTICAL_DIRECTIONS = new Set(['LRBT', 'LRTB', 'RLBT', 'RLTB']);

/** Directions `getPosXforFillX` lays out first-to-last rather than last-to-first. */
const FORWARD_X = new Set(['LRTB', 'LRBT', 'TBLR', 'BTLR', 'LR']);
/** The same for `getPosYforFillY`. */
const FORWARD_Y = new Set(['LRTB', 'RLTB', 'TBLR', 'TBRL', 'TB']);

/** Where a run of fill containers sits: at the start, centered, or at the end. */
type Anchor = 's' | 'c' | 'e';
const ALIGN_X: {[align: string]: Anchor} = {
  left: 's', LT: 's', LM: 's', LB: 's',
  center: 'c', CT: 'c', CM: 'c', CB: 'c',
  right: 'e', RT: 'e', RM: 'e', RB: 'e',
};
const ALIGN_Y: {[align: string]: Anchor} = {
  top: 's', LT: 's', CT: 's', RT: 's',
  middle: 'c', LM: 'c', CM: 'c', RM: 'c',
  bottom: 'e', LB: 'e', CB: 'e', RB: 'e',
};

/** Datasets this module owns, so `drawing.ts` can read them by name. */
export const ROWS_BY_ID = '__rowsById';
export const RAW_ROWS = '__rawRows';
export const levelName = (depth: number): string => `level${depth}`;

/** `getValue`: what one container contributes to its level's unit length. */
function valueExpr(layout: Layout): string {
  switch (layout.size && layout.size.type) {
    case 'sum':
      return 'datum.sumVal';
    case 'count':
      return 'datum.cnt';
    // `uniform`, which `applyDefault` also writes onto any level that omits it
    default:
      return '1';
  }
}

/**
 * A data field name, as a transform's `field` parameter wants it.
 *
 * Vega reads `.` and `[` in a field reference as path syntax, so a column
 * actually named `home.dest` -- which the titanic data has -- has to say so.
 * Expressions are unaffected: they index with `datum[...]` and take the name
 * whole.
 */
function fieldRef(field: string): string {
  return field.replace(/([.[\]\\])/g, '\\$1');
}

/** A vega expression reading `field` off a row, coerced the way `Number` does. */
function numberExpr(field: string): string {
  // `toNumber('')` is null in vega but `Number('')` is 0 in the engine, and the
  // difference decides whether a blank cell drags a bin domain down to zero.
  const key = JSON.stringify(field);
  return `datum[${key}] === '' ? 0 : toNumber(datum[${key}])`;
}

/**
 * The container an `isShared` policy ranges over, as the key naming it.
 *
 * `getSharingAncestorContainer` recurses with the parent *container* in the
 * layout slot, so the second call finds no policy there and returns at once: a
 * shared policy climbs exactly one level, never further. Both `subgroup` and
 * `size` sharing work that way -- a shared subgroup reads its domain from that
 * container, and a shared size is minimized across the containers under it. At
 * the top there is only the canvas, so sharing has nothing to range over and
 * each parent stands alone.
 */
function sharingScope(depth: number, shared: boolean | undefined): string {
  return shared && depth >= 2 ? `ck${depth - 2}` : `ck${depth - 1}`;
}

export function buildLayoutData(spec: Spec, rows: DataRow[]): VegaData[] {
  const data: VegaData[] = [];
  const numLayouts = spec.layouts.length;
  const padding = spec.padding!;
  const fields = fieldsOf(rows);

  // The rows, stamped with the `id` the engine stamps on them so that `id` is
  // available as a grouping key and as the identity a unit mark looks itself up
  // by. A projection of the source fields alone is what the mark's tooltip and
  // color encoding read, so nothing internal to the layout leaks into it.
  data.push(
    {name: RAW_ROWS, values: rows.map((row, index) => ({...row, id: index}))},
    {
      name: ROWS_BY_ID,
      // A copy of the source fields alone. The layout stages downstream write
      // their bookkeeping onto the tuples they share with `RAW_ROWS`, and
      // `project` is what keeps that out of the mark tooltips.
      source: RAW_ROWS,
      transform: [{type: 'project', fields: fields.map(fieldRef), as: fields}],
    },
  );

  // Depth 0 is the canvas. It carries `cnt`/`firstId` like any other container
  // so that a spec with no layouts at all still draws its one mark.
  data.push({
    name: levelName(0),
    values: [
      {
        ck0: '',
        absX: 0,
        absY: 0,
        width: spec.width,
        height: spec.height,
        padT: padding.top,
        padL: padding.left,
        padB: padding.bottom,
        padR: padding.right,
        label: 'root',
        depth: 0,
        cnt: rows.length,
        firstId: 0,
        seq: 0,
      },
    ],
  });

  let rowsName = '__rows0';
  data.push({name: rowsName, source: RAW_ROWS, transform: [{type: 'formula', as: 'ck0', expr: "''"}]});

  for (let depth = 1; depth <= numLayouts; depth++) {
    const layout = spec.layouts[depth - 1];
    const nextRows = `__rows${depth}`;

    data.push(...assignKeys(depth, layout, rowsName, nextRows, data));
    data.push(...buildContainers(depth, layout, nextRows));
    data.push(...applyGeometry(depth, layout));
    rowsName = nextRows;
  }

  return data;
}

/** The union of every field name the rows carry, plus `id`. */
function fieldsOf(rows: DataRow[]): string[] {
  const seen = new Set<string>(['id']);
  rows.forEach(row => Object.keys(row).forEach(key => seen.add(key)));
  return Array.from(seen);
}

/**
 * Step one of a level: decide which child container each row belongs to, and
 * name it. `k${depth}` is the child's own key and `ck${depth}` its full path.
 */
function assignKeys(
  depth: number,
  layout: Layout,
  rowsName: string,
  nextRows: string,
  data: VegaData[],
): VegaData[] {
  const subgroup = layout.subgroup;
  const prevCk = `ck${depth - 1}`;
  const transform: Transforms[] = [];
  const extra: VegaData[] = [];

  switch (subgroup.type) {
    case 'groupby':
      transform.push({
        type: 'formula',
        as: `k${depth}`,
        expr: `'' + datum[${JSON.stringify(subgroup.key)}]`,
      });
      break;

    case 'passthrough':
      transform.push({type: 'formula', as: `k${depth}`, expr: "''"});
      break;

    case 'flatten':
      // The label the engine stamps on a flattened container is the row's index
      // *before* the level's sort runs, so identity and position part ways here.
      transform.push(
        {
          type: 'window',
          ops: ['row_number'],
          as: [`k${depth}`],
          groupby: [prevCk],
          sort: {field: ['id'], order: ['ascending']},
        },
        {type: 'formula', as: `k${depth}`, expr: `datum.k${depth} - 1`},
      );
      break;

    case 'bin':
      extra.push(binExtent(depth, layout, rowsName));
      transform.push(...binAssignment(depth, layout));
      break;

    default:
      throw new Error(`unit-vis-vega: unsupported subgroup type "${subgroup.type}"`);
  }

  transform.push({
    type: 'formula',
    as: `ck${depth}`,
    expr: `datum.${prevCk} + ${JSON.stringify(SEP)} + datum.k${depth}`,
  });

  data.push(...extra);
  return [{name: nextRows, source: rowsName, transform}];
}

/** The `[low, high]` a `bin` level cuts up, per sharing scope. */
function binExtent(depth: number, layout: Layout, rowsName: string): VegaData {
  const scope = sharingScope(depth, layout.subgroup.isShared);
  return {
    name: `__binext${depth}`,
    source: rowsName,
    transform: [
      {type: 'formula', as: '__bv', expr: numberExpr(layout.subgroup.key!)},
      {
        type: 'aggregate',
        groupby: [scope],
        fields: ['__bv', '__bv'],
        ops: ['min', 'max'],
        as: ['binLo', 'binHi'],
      },
    ],
  };
}

/**
 * Which bin a row lands in.
 *
 * The engine cuts `[low, high]` into `numBin` equal steps, drops the leading
 * edge because it equals the minimum, and bisects. The closed form below lands
 * within one step of the answer either way, so two corrections settle it
 * exactly -- and the edges are written the way `linearScale` writes them,
 * because the two algebraically equal forms round differently and the edges are
 * compared against the data with `<=`.
 *
 * Rows with a blank value form a group of their own at key `-1`; rows outside
 * the domain are dropped rather than clamped, exactly as `bin` drops them.
 */
function binAssignment(depth: number, layout: Layout): Transforms[] {
  const scope = sharingScope(depth, layout.subgroup.isShared);
  const numBin = layout.subgroup.numBin!;
  const key = JSON.stringify(layout.subgroup.key);
  const edge = (i: string): string =>
    `datum.binLo * (1 - (${i}) / ${numBin}) + datum.binHi * ((${i}) / ${numBin})`;

  return [
    {type: 'lookup', from: `__binext${depth}`, key: scope, fields: [scope], values: ['binLo', 'binHi']},
    {type: 'formula', as: '__bv', expr: numberExpr(layout.subgroup.key!)},
    {
      type: 'formula',
      as: '__i',
      expr:
        `datum.binHi === datum.binLo ? 0 : ` +
        `clamp(floor((datum.__bv - datum.binLo) / (datum.binHi - datum.binLo) * ${numBin}), 0, ${numBin})`,
    },
    {type: 'formula', as: '__t', expr: edge('datum.__i')},
    {type: 'formula', as: '__i', expr: 'datum.__t > datum.__bv ? datum.__i - 1 : datum.__i'},
    {type: 'formula', as: '__t', expr: edge('datum.__i + 1')},
    {
      type: 'formula',
      as: '__i',
      expr: `datum.__i < ${numBin} && datum.__t <= datum.__bv ? datum.__i + 1 : datum.__i`,
    },
    {
      type: 'formula',
      as: `k${depth}`,
      expr:
        `datum[${key}] === '' ? -1 : ` +
        `(datum.__bv >= datum.binLo && datum.__bv <= datum.binHi ? datum.__i : null)`,
    },
    {type: 'filter', expr: `datum.k${depth} !== null`},
  ];
}

/**
 * Step two: the containers themselves, in the order the engine builds them.
 *
 * A container that holds no rows is still a container -- it takes a slot, and
 * the space it occupies changes where its siblings sit. Only `flatten` builds
 * its containers from the rows; the rest cross their parents with a domain so
 * the empty ones survive.
 */
function buildContainers(depth: number, layout: Layout, rowsName: string): VegaData[] {
  const subgroup = layout.subgroup;
  const prevCk = `ck${depth - 1}`;
  const ck = `ck${depth}`;
  const parent = levelName(depth - 1);
  const sizeKey = layout.size && layout.size.key;
  const weighted = sizeKey ? [fieldRef(sizeKey)] : [];
  const weightedAs = sizeKey ? ['sumVal'] : [];
  const data: VegaData[] = [];

  // What each (parent, key) pair actually holds.
  data.push({
    name: `__present${depth}`,
    source: rowsName,
    transform: [
      {
        type: 'aggregate',
        groupby: [prevCk, `k${depth}`, ck],
        fields: [null, ...weighted, 'id'],
        ops: ['count', ...(sizeKey ? ['sum'] : []), 'min'],
        as: ['cnt', ...weightedAs, 'firstId'],
      } as Transforms,
    ],
  });

  // Everything the containers inherit from the box they sit in. `seq` is the
  // parent's position in tree order, which is what puts this level's containers
  // back in the order the d3 backend walks them in.
  const inherited = ['absX', 'absY', 'width', 'height', 'padT', 'padL', 'padB', 'padR', 'seq'];
  const inheritedAs = ['pAbsX', 'pAbsY', 'pw', 'ph', 'ppadT', 'ppadL', 'ppadB', 'ppadR', 'pSeq'];

  if (subgroup.type === 'flatten') {
    // One row per container, so the rows are the containers. `sort` decides
    // where a container sits; the label decides which one it is.
    data.push({
      name: `${levelName(depth)}_raw`,
      source: rowsName,
      transform: [
        {type: 'formula', as: 'cnt', expr: '1'},
        ...(sizeKey
          ? [{type: 'formula', as: 'sumVal', expr: numberExpr(sizeKey)} as Transforms]
          : []),
        {type: 'formula', as: 'firstId', expr: 'datum.id'},
        {type: 'formula', as: 'label', expr: `datum.k${depth}`},
        ...flattenOrder(depth, layout, prevCk),
        {type: 'window', ops: ['row_number'], as: ['idx'], groupby: [prevCk]},
        {type: 'formula', as: 'idx', expr: 'datum.idx - 1'},
        {
          type: 'lookup',
          from: parent,
          key: prevCk,
          fields: [prevCk],
          values: inherited,
          as: inheritedAs,
        },
      ],
    });
    return data;
  }

  // The rest cross their parents with a domain. `flatten` over a field holding
  // the domain is vega's cross join, and it keeps the parent's fields on every
  // tuple it produces -- including the whole `ck0..ck` chain, which the shared
  // size policies need.
  const domain: Transforms[] = [];
  if (subgroup.type === 'groupby') {
    data.push(groupbyDomain(depth, layout, rowsName));
    const scope = sharingScope(depth, subgroup.isShared);
    domain.push(
      {type: 'formula', as: '__cands', expr: `data('__dom${depth}')`},
      {type: 'flatten', fields: ['__cands'], as: ['__cand']},
      {type: 'filter', expr: `datum.__cand.${scope} === datum.${scope}`},
      {type: 'formula', as: `k${depth}`, expr: `datum.__cand.k${depth}`},
      {type: 'formula', as: 'label', expr: `datum.k${depth}`},
    );
  } else if (subgroup.type === 'passthrough') {
    // Exactly one child, which takes its parent's label.
    domain.push(
      {type: 'formula', as: `k${depth}`, expr: "''"},
      {type: 'formula', as: 'label', expr: 'datum.label'},
    );
  } else {
    domain.push(...binDomain(depth, layout));
  }

  data.push({
    name: `${levelName(depth)}_raw`,
    source: parent,
    transform: [
      // Read before the cross overwrites them: a crossed tuple carries the
      // parent's own box in the very fields the child is about to claim.
      ...inherited.map((field, i) => ({
        type: 'formula' as const,
        as: inheritedAs[i],
        expr: `datum.${field}`,
      })),
      ...domain,
      {type: 'formula', as: `ck${depth}`, expr: `datum.${prevCk} + ${JSON.stringify(SEP)} + datum.k${depth}`},
      {
        type: 'lookup',
        from: `__present${depth}`,
        key: ck,
        fields: [ck],
        values: ['cnt', ...weightedAs, 'firstId'],
        default: 0,
      },
      {type: 'window', ops: ['row_number'], as: ['idx'], groupby: [prevCk]},
      {type: 'formula', as: 'idx', expr: 'datum.idx - 1'},
    ],
  });

  return data;
}

/**
 * The order a `flatten` level puts its containers in.
 *
 * `makeContainersForFlatten` sorts with a comparator that never returns 0 --
 * equal values report "less than" on an ascending sort -- and `Array#sort`
 * answers an inconsistent comparator by reversing the tied run. Reproduced here
 * as a descending secondary key on the label, which is what the run was ordered
 * by before the sort.
 */
function flattenOrder(depth: number, layout: Layout, prevCk: string): Transforms[] {
  const sort = layout.sort;
  if (!sort || !sort.key) {
    return [{type: 'collect', sort: {field: [prevCk, `k${depth}`], order: ['ascending', 'ascending']}}];
  }
  const ascending = sort.direction === 'ascending';
  return [
    {
      type: 'formula',
      as: '__sortVal',
      expr:
        sort.type === 'numerical'
          ? `toNumber(datum[${JSON.stringify(sort.key)}])`
          : `datum[${JSON.stringify(sort.key)}]`,
    },
    {
      type: 'collect',
      sort: {
        field: [prevCk, '__sortVal', `k${depth}`],
        order: [
          'ascending',
          ascending ? 'ascending' : 'descending',
          ascending ? 'descending' : 'ascending',
        ],
      },
    },
  ];
}

/**
 * The categories a `groupby` level splits into, in `getKeys` order.
 *
 * `getKeys` reads `Object.keys` off an accumulator, so integer-like keys come
 * out first in numeric order and everything else follows in first-seen order.
 */
function groupbyDomain(depth: number, layout: Layout, rowsName: string): VegaData {
  const scope = sharingScope(depth, layout.subgroup.isShared);
  return {
    name: `__dom${depth}`,
    source: rowsName,
    transform: [
      {type: 'aggregate', groupby: [scope, `k${depth}`], fields: ['id'], ops: ['min'], as: ['firstId']},
      {
        type: 'formula',
        as: '__numeric',
        expr: `isFinite(toNumber(datum.k${depth})) && datum.k${depth} !== '' ? 0 : 1`,
      },
      {type: 'formula', as: '__order', expr: `datum.__numeric === 0 ? toNumber(datum.k${depth}) : 0`},
      {
        type: 'collect',
        sort: {field: ['__numeric', '__order', 'firstId'], order: ['ascending', 'ascending', 'ascending']},
      },
    ],
  };
}

/**
 * The containers a `bin` level produces: the blank-value group at key `-1`, then
 * one per interval.
 *
 * There are `numBin + 1` intervals rather than `numBin` because trimming the
 * leading edge leaves a zero-width interval at the top, which collects the rows
 * sitting exactly on the maximum. Two degenerate domains change the count:
 * a single repeated value collapses the trimming to one interval, and a domain
 * with nothing numeric in it trims nothing and keeps `numBin + 2`.
 */
function binDomain(depth: number, layout: Layout): Transforms[] {
  const scope = sharingScope(depth, layout.subgroup.isShared);
  const numBin = layout.subgroup.numBin!;
  const edge = (i: string): string =>
    `datum.binLo * (1 - (${i}) / ${numBin}) + datum.binHi * ((${i}) / ${numBin})`;

  return [
    {type: 'lookup', from: `__binext${depth}`, key: scope, fields: [scope], values: ['binLo', 'binHi']},
    {
      type: 'formula',
      as: '__cands',
      expr:
        `sequence(-1, !isValid(datum.binLo) || isNaN(datum.binLo) ? ${numBin + 2}` +
        ` : (datum.binHi === datum.binLo ? 1 : ${numBin + 1}))`,
    },
    {type: 'flatten', fields: ['__cands'], as: [`k${depth}`]},
    {
      type: 'formula',
      as: '__x0',
      expr: `datum.k${depth} > 0 ? ${edge(`datum.k${depth}`)} : datum.binLo`,
    },
    {
      type: 'formula',
      as: '__x1',
      expr: `datum.k${depth} < ${numBin} ? ${edge(`datum.k${depth} + 1`)} : datum.binHi`,
    },
    // The blank-value group is a bare array in the engine, so its edges read
    // back undefined and its label prints them as such.
    {
      type: 'formula',
      as: 'label',
      expr: `datum.k${depth} < 0 ? 'undefined-undefined' : datum.__x0 + '-' + datum.__x1`,
    },
  ];
}

/**
 * Step three: turn a level's containers into boxes.
 *
 * Every branch here mirrors one arm of `calcGridxyVisualSpace`, and the two
 * searches the engine runs as loops -- the grid that leaves units largest, and
 * the smallest repetition count that fits -- become a generated candidate set
 * reduced with `argmax`/`min`. The candidates are generated once per *parent*
 * rather than once per container, which is what keeps that linear.
 */
function applyGeometry(depth: number, layout: Layout): VegaData[] {
  const source = `${levelName(depth)}_raw`;
  const prevCk = `ck${depth - 1}`;
  const pad = layout.padding!;
  const stamp: Transforms[] = [
    {type: 'formula', as: 'absX', expr: 'datum.pAbsX + datum.relX'},
    {type: 'formula', as: 'absY', expr: 'datum.pAbsY + datum.relY'},
    {type: 'formula', as: 'depth', expr: `${depth}`},
    // Tree order: parents in theirs, then children within each parent. This is
    // the order the d3 backend's nested selections emit marks in, and it is what
    // an ordinal color scale reads its domain off, so it has to be the order the
    // level leaves its containers in. Sorting on the composite key would order
    // parents as strings -- "10" before "2" -- so the position carries down as a
    // number instead.
    {type: 'collect', sort: {field: ['pSeq', 'idx'], order: ['ascending', 'ascending']}},
    {type: 'window', ops: ['row_number'], as: ['seq']},
    {type: 'formula', as: 'seq', expr: 'datum.seq - 1'},
  ];
  const stampPadding: Transforms[] = [
    {type: 'formula', as: 'padT', expr: `${pad.top}`},
    {type: 'formula', as: 'padL', expr: `${pad.left}`},
    {type: 'formula', as: 'padB', expr: `${pad.bottom}`},
    {type: 'formula', as: 'padR', expr: `${pad.right}`},
  ];

  if (layout.aspect_ratio === 'fillX' || layout.aspect_ratio === 'fillY') {
    return fillGeometry(depth, layout, source, prevCk, stamp, stampPadding);
  }
  return packGeometry(depth, layout, source, prevCk, stamp, stampPadding);
}

/** `calcFillGridxyVisualSpace`: a row or a column of boxes sharing one axis. */
function fillGeometry(
  depth: number,
  layout: Layout,
  source: string,
  prevCk: string,
  stamp: Transforms[],
  stampPadding: Transforms[],
): VegaData[] {
  const fillX = layout.aspect_ratio === 'fillX';
  const margin = layout.margin!;
  const shared = Boolean(layout.size && layout.size.isShared);
  const group = sharingScope(depth, shared);

  const available = fillX
    ? 'datum.pw - datum.ppadL - datum.ppadR'
    : 'datum.ph - datum.ppadT - datum.ppadB';

  const sized: Transforms[] = fillX
    ? [
        {type: 'formula', as: 'width', expr: `datum.__unit * datum.__value - ${margin.left} - ${margin.right}`},
        {
          type: 'formula',
          as: 'height',
          expr: `datum.ph - datum.ppadT - datum.ppadB - ${margin.top} - ${margin.bottom}`,
        },
        {type: 'formula', as: 'relY', expr: `datum.ppadT + ${margin.top}`},
        {type: 'formula', as: '__slot', expr: `datum.width + ${margin.left} + ${margin.right}`},
      ]
    : [
        {type: 'formula', as: 'height', expr: `datum.__unit * datum.__value - ${margin.top} - ${margin.bottom}`},
        {
          type: 'formula',
          as: 'width',
          expr: `datum.pw - datum.ppadL - datum.ppadR - ${margin.left} - ${margin.right}`,
        },
        {type: 'formula', as: 'relX', expr: `datum.ppadL + ${margin.left}`},
        {type: 'formula', as: '__slot', expr: `datum.height + ${margin.top} + ${margin.bottom}`},
      ];

  const forward = fillX ? FORWARD_X.has(layout.direction!) : FORWARD_Y.has(layout.direction!);
  const anchor = (fillX ? ALIGN_X : ALIGN_Y)[layout.align!];
  const padStart = fillX ? 'datum.ppadL' : 'datum.ppadT';
  const padEnd = fillX ? 'datum.ppadR' : 'datum.ppadB';
  const parentSize = fillX ? 'datum.pw' : 'datum.ph';
  const marginStart = fillX ? margin.left : margin.top;

  const offset =
    anchor === 'c'
      ? `${padStart} + (${parentSize} - ${padStart} - ${padEnd}) / 2 - datum.__total / 2`
      : anchor === 'e'
        ? `${parentSize} - ${padEnd} - datum.__total`
        : padStart;

  return [
    {
      name: levelName(depth),
      source,
      transform: [
        {type: 'formula', as: '__value', expr: valueExpr(layout)},
        {type: 'joinaggregate', groupby: [prevCk], fields: ['__value'], ops: ['sum'], as: ['__valueSum']},
        {type: 'formula', as: '__unit', expr: `(${available}) / datum.__valueSum`},
        // One unit length across the whole sharing group, so sibling groups stay
        // comparable rather than each filling its own parent.
        ...(shared
          ? [
              {
                type: 'joinaggregate',
                groupby: [group],
                fields: ['__unit'],
                ops: ['min'],
                as: ['__unit'],
              } as Transforms,
            ]
          : []),
        ...sized,
        {type: 'joinaggregate', groupby: [prevCk], fields: ['__slot'], ops: ['sum'], as: ['__total']},
        // Walk the slots in the direction's own order, then read the running
        // offset back off each container.
        {
          type: 'collect',
          sort: {field: [prevCk, 'idx'], order: ['ascending', forward ? 'ascending' : 'descending']},
        },
        {
          type: 'window',
          ops: ['sum'],
          fields: ['__slot'],
          as: ['__through'],
          groupby: [prevCk],
          frame: [null, 0],
        },
        {
          type: 'formula',
          as: fillX ? 'relX' : 'relY',
          expr: `(${offset}) + ${marginStart} + datum.__through - datum.__slot`,
        },
        // Back into container order. A backward direction walked the slots the
        // other way above, and this dataset is what the marks are emitted from.
        {type: 'collect', sort: {field: [prevCk, 'idx'], order: ['ascending', 'ascending']}},
        ...stamp,
        ...stampPadding,
      ],
    },
  ];
}

/**
 * `calcPackGridxyVisualSpace` and `calcPackGridxyMaxFillVisualSpace`: boxes
 * packed into a grid, or squarified into a treemap.
 */
function packGeometry(
  depth: number,
  layout: Layout,
  source: string,
  prevCk: string,
  stamp: Transforms[],
  stampPadding: Transforms[],
): VegaData[] {
  const uniform = !layout.size || !layout.size.type || layout.size.type === 'uniform';
  const shared = Boolean(layout.size && layout.size.isShared);
  const maxfill = layout.aspect_ratio === 'maxfill';

  if (maxfill && !uniform) {
    // A weighted `maxfill` is a squarified treemap, which is a sequential
    // algorithm rather than an aggregate. Sharing has no arm for it, so the
    // treemap is the whole of this level's geometry.
    return [treemapGeometry(depth, layout, source, prevCk, stamp, stampPadding)];
  }

  const data: VegaData[] = [];

  // A shared, weighted `square` level sizes by area instead of by grid, and
  // overwrites every box the grid would have produced -- so there is no grid to
  // compute at all.
  if (shared && !uniform && layout.aspect_ratio === 'square') {
    const placement = sharedSquareUnit(depth, layout, source, prevCk, data);
    return [
      ...data,
      {
        name: levelName(depth),
        source,
        transform: [
          ...placement,
          ...stamp,
          // `calcPackGridxyVisualSpaceWithUnitLength` never writes a padding, so
          // the containers keep whatever they were built with. Every other arm
          // stamps the level's own.
          ...initialPadding(layout),
        ],
      },
    ];
  }

  // The grid depends only on the parent's box and how many children it holds,
  // so it is decided once per parent -- not once per container.
  data.push({
    name: `__grid${depth}`,
    source,
    transform: [
      {
        type: 'aggregate',
        groupby: [prevCk],
        fields: [null, 'pw', 'ph'],
        ops: ['count', 'min', 'min'],
        as: ['n', 'pw', 'ph'],
      },
      ...(maxfill ? maxfillSearch(layout, prevCk) : repetitionSearch(layout, prevCk)),
    ],
  });

  let grid = `__grid${depth}`;
  if (shared && uniform) {
    data.push(sharedGrid(depth, layout, source, prevCk, grid));
    grid = `__sharedGrid${depth}`;
  }

  return [
    ...data,
    {
      name: levelName(depth),
      source,
      transform: [
        {
          type: 'lookup',
          from: grid,
          key: prevCk,
          fields: [prevCk],
          values: ['fillRep', 'fillSide', 'remSide'],
        },
        ...edgePlacement(layout),
        ...stamp,
        ...stampPadding,
      ],
    },
  ];
}

/**
 * `buildEdgeInfoForMaxFill`: of every `a × ceil(n / a)` grid, the one whose
 * shorter edge is longest. `argmax` keeps the first of a tie, which is what
 * `maxIndex` does.
 */
function maxfillSearch(layout: Layout, prevCk: string): Transforms[] {
  // `buildEdgeInfoByDirection`: which axis the units run along before they wrap.
  const vertical = VERTICAL_DIRECTIONS.has(layout.direction!);
  return [
    {type: 'formula', as: '__cands', expr: 'sequence(1, datum.n + 1)'},
    {type: 'flatten', fields: ['__cands'], as: ['__a']},
    {type: 'formula', as: '__b', expr: 'ceil(datum.n / datum.__a)'},
    {type: 'formula', as: '__w', expr: 'datum.pw / datum.__a'},
    {type: 'formula', as: '__h', expr: 'datum.ph / datum.__b'},
    {type: 'formula', as: '__minEdge', expr: 'datum.__w > datum.__h ? datum.__h : datum.__w'},
    {
      type: 'aggregate',
      groupby: [prevCk, 'n', 'pw', 'ph'],
      fields: ['__minEdge'],
      ops: ['argmax'],
      as: ['__best'],
    },
    // `__unitW`/`__unitH` stay in width/height terms, which is how the shared
    // policy compares boxes across parents.
    {type: 'formula', as: '__unitW', expr: 'datum.__best.__w'},
    {type: 'formula', as: '__unitH', expr: 'datum.__best.__h'},
    {type: 'formula', as: 'fillRep', expr: vertical ? 'datum.__best.__a' : 'datum.__best.__b'},
    {type: 'formula', as: 'fillSide', expr: vertical ? 'datum.__unitW' : 'datum.__unitH'},
    {type: 'formula', as: 'remSide', expr: vertical ? 'datum.__unitH' : 'datum.__unitW'},
  ];
}

/**
 * `getRepetitionCountForFillingEdge`: the fewest repetitions along the filling
 * edge that leave room for every child at the level's aspect ratio.
 *
 * The engine finds it by incrementing until the grid is big enough; here every
 * candidate is generated and the smallest passing one is taken. `custom` has no
 * field to supply a ratio, so its comparisons are all against NaN and both
 * agree on the first candidate and an unsized box.
 */
function repetitionSearch(layout: Layout, prevCk: string): Transforms[] {
  const ratio =
    layout.aspect_ratio === 'square'
      ? '1'
      : layout.aspect_ratio === 'parent'
        ? 'datum.pw / datum.ph'
        : 'NaN';
  const vertical = VERTICAL_DIRECTIONS.has(layout.direction!);
  // A vertical direction fills along x and wraps down y; a horizontal one is the
  // transpose, ratio included.
  const filling = vertical ? 'datum.pw' : 'datum.ph';
  const remaining = vertical ? 'datum.ph' : 'datum.pw';
  const effective = vertical ? `(${ratio})` : `(1 / (${ratio}))`;

  return [
    {type: 'formula', as: '__ratio', expr: effective},
    // How far the engine's loop could run. With `c` the repetitions per step
    // along the remaining edge, it needs `floor(c*k)*k >= n`, which holds once
    // `k` clears both `1/c` and `sqrt(2n/c)`. A NaN ratio never satisfies the
    // loop's test either, so it stops at the first candidate; the cap is a
    // backstop against a degenerate box, where the engine itself would spin.
    {type: 'formula', as: '__c', expr: `(${remaining}) * datum.__ratio / (${filling})`},
    {
      type: 'formula',
      as: '__kmax',
      expr:
        'isNaN(datum.__c) ? 1 : ' +
        'min(10000, ceil(1 / datum.__c) + ceil(sqrt(2 * datum.n / datum.__c)) + 2)',
    },
    {type: 'formula', as: '__cands', expr: 'sequence(1, datum.__kmax + 1)'},
    {type: 'flatten', fields: ['__cands'], as: ['__k']},
    {type: 'formula', as: '__fillSide', expr: `${filling} / datum.__k`},
    {type: 'formula', as: '__remSide', expr: 'datum.__fillSide / datum.__ratio'},
    {
      type: 'formula',
      as: '__remRep',
      expr: `floor((${remaining}) * datum.__k * datum.__ratio / (${filling}))`,
    },
    // The engine's loop stops at the first candidate that fits, and a NaN ratio
    // fails the comparison rather than passing it, so `custom` stops at k = 1
    // with unsized boxes. Comparing the other way round keeps that.
    {type: 'filter', expr: 'datum.n > datum.__remRep * datum.__k ? false : true'},
    {
      type: 'aggregate',
      groupby: [prevCk, 'n', 'pw', 'ph'],
      fields: ['__k'],
      ops: ['argmin'],
      as: ['__best'],
    },
    // `calcEdgeInfo` already chose which axis fills, so these are the edges the
    // packing branch reads directly.
    {type: 'formula', as: 'fillRep', expr: 'datum.__best.__k'},
    {type: 'formula', as: 'fillSide', expr: 'datum.__best.__fillSide'},
    {type: 'formula', as: 'remSide', expr: 'datum.__best.__remSide'},
  ];
}

/**
 * `applySharedSizeOnContainers`: re-grid every parent in the sharing group on
 * the smallest unit box any of them produced, so one unit means one size across
 * the group.
 *
 * `maxfill` ranks candidates on their shorter edge with the longer one as a
 * tiebreak, since its boxes vary in both axes at once; the fixed-ratio packings
 * keep their shape and are ranked on width alone.
 */
function sharedGrid(
  depth: number,
  layout: Layout,
  source: string,
  prevCk: string,
  grid: string,
): VegaData {
  const group = sharingScope(depth, true);
  const maxfill = layout.aspect_ratio === 'maxfill';
  const vertical = VERTICAL_DIRECTIONS.has(layout.direction!);
  // `getMinAmongContainers` ranks the containers as they were drawn, so the
  // edges have to be back in width/height terms first. `maxfill` already keeps
  // them that way; a fixed-ratio packing has them in filling/remaining terms.
  const boxSize: Transforms[] = maxfill
    ? [
        {type: 'formula', as: '__boxW', expr: 'datum.__unitW'},
        {type: 'formula', as: '__boxH', expr: 'datum.__unitH'},
      ]
    : [
        {type: 'formula', as: '__boxW', expr: vertical ? 'datum.fillSide' : 'datum.remSide'},
        {type: 'formula', as: '__boxH', expr: vertical ? 'datum.remSide' : 'datum.fillSide'},
      ];

  const rank: Transforms[] = maxfill
    ? [
        {type: 'formula', as: '__short', expr: 'datum.__boxH > datum.__boxW ? datum.__boxW : datum.__boxH'},
        {type: 'formula', as: '__long', expr: 'datum.__boxH > datum.__boxW ? datum.__boxH : datum.__boxW'},
        {type: 'joinaggregate', groupby: ['__group'], fields: ['__short'], ops: ['min'], as: ['__minShort']},
        // The vega expression language has no `Infinity` literal, and a
        // candidate that lost on the shorter edge only has to lose the tiebreak.
        {
          type: 'formula',
          as: '__tiebreak',
          expr: 'datum.__short === datum.__minShort ? datum.__long : 1e308',
        },
        {type: 'joinaggregate', groupby: ['__group'], fields: ['__tiebreak'], ops: ['min'], as: ['__minLong']},
        {
          type: 'formula',
          as: '__isMin',
          expr: 'datum.__short === datum.__minShort && datum.__long === datum.__minLong',
        },
      ]
    : [
        {type: 'joinaggregate', groupby: ['__group'], fields: ['__boxW'], ops: ['min'], as: ['__minWidth']},
        {type: 'formula', as: '__isMin', expr: 'datum.__boxW === datum.__minWidth'},
      ];

  return {
    name: `__sharedGrid${depth}`,
    source: grid,
    transform: [
      // `aggregate` emitted fresh tuples upstream, so the group this parent
      // belongs to has to be read back off its containers.
      {type: 'lookup', from: source, key: prevCk, fields: [prevCk], values: [group], as: ['__group']},
      ...boxSize,
      ...rank,
      {type: 'formula', as: '__selW', expr: 'datum.__isMin ? datum.__boxW : null'},
      {type: 'formula', as: '__selH', expr: 'datum.__isMin ? datum.__boxH : null'},
      {
        type: 'joinaggregate',
        groupby: ['__group'],
        fields: ['__selW', '__selH'],
        ops: ['min', 'min'],
        as: ['__sharedW', '__sharedH'],
      },
      // `buildEdgeInfoFromMinSize`: each parent fits as many of that box as it
      // can, which is why the group can stay comparable without every parent
      // holding the same number of children.
      ...(vertical
        ? [
            {type: 'formula', as: 'fillRep', expr: 'floor(datum.pw / datum.__sharedW)'},
            {type: 'formula', as: 'fillSide', expr: 'datum.__sharedW'},
            {type: 'formula', as: 'remSide', expr: 'datum.__sharedH'},
          ]
        : [
            {type: 'formula', as: 'fillRep', expr: 'floor(datum.ph / datum.__sharedH)'},
            {type: 'formula', as: 'fillSide', expr: 'datum.__sharedH'},
            {type: 'formula', as: 'remSide', expr: 'datum.__sharedW'},
          ]),
    ] as Transforms[],
  };
}

/**
 * `applyEdgeInfo`: run the boxes along the filling edge and wrap onto the
 * remaining one.
 *
 * The right-to-left orders are accepted by the grammar but unimplemented in the
 * engine, which logs and leaves the boxes unpositioned; NaN offsets carry that
 * through rather than quietly inventing a placement.
 */
function edgePlacement(layout: Layout): Transforms[] {
  const direction = layout.direction!;
  if (VERTICAL_DIRECTIONS.has(direction)) {
    if (direction === 'RLBT' || direction === 'RLTB') {
      return unpositioned();
    }
    const originY = direction === 'LRBT' ? 'datum.ph - datum.remSide' : '0';
    const stepY = direction === 'LRBT' ? '-datum.remSide' : 'datum.remSide';
    return [
      {type: 'formula', as: 'width', expr: 'datum.fillSide'},
      {type: 'formula', as: 'height', expr: 'datum.remSide'},
      {type: 'formula', as: 'relX', expr: 'datum.fillSide * (datum.idx % datum.fillRep)'},
      {type: 'formula', as: 'relY', expr: `${originY} + (${stepY}) * floor(datum.idx / datum.fillRep)`},
    ];
  }
  if (direction === 'TBRL' || direction === 'BTRL') {
    return unpositioned();
  }
  const originY = direction === 'BTLR' ? 'datum.ph - datum.remSide' : '0';
  const stepY = direction === 'BTLR' ? '-datum.fillSide' : 'datum.fillSide';
  return [
    {type: 'formula', as: 'width', expr: 'datum.remSide'},
    {type: 'formula', as: 'height', expr: 'datum.fillSide'},
    {type: 'formula', as: 'relX', expr: 'datum.remSide * floor(datum.idx / datum.fillRep)'},
    {type: 'formula', as: 'relY', expr: `${originY} + (${stepY}) * (datum.idx % datum.fillRep)`},
  ];
}

function unpositioned(): Transforms[] {
  return [
    {type: 'formula', as: 'width', expr: 'NaN'},
    {type: 'formula', as: 'height', expr: 'NaN'},
    {type: 'formula', as: 'relX', expr: 'NaN'},
    {type: 'formula', as: 'relY', expr: 'NaN'},
  ];
}

/**
 * `calcPackGridxyVisualSpaceWithUnitLength`, the one packing arm that sizes by
 * area rather than by grid: a shared, weighted `square` level gives each
 * container a square of `unit * value` area and centers it in its parent.
 */
function sharedSquareUnit(
  depth: number,
  layout: Layout,
  source: string,
  prevCk: string,
  data: VegaData[],
): Transforms[] {
  const margin = layout.margin!;
  const group = sharingScope(depth, true);

  // `getAvailableSpace` for a square level is the largest square that fits.
  data.push({
    name: `__unitLen${depth}`,
    source,
    transform: [
      {type: 'formula', as: '__value', expr: valueExpr(layout)},
      {
        type: 'aggregate',
        groupby: [prevCk, group],
        fields: ['__value', 'pw', 'ph', 'ppadL', 'ppadR', 'ppadT', 'ppadB'],
        ops: ['sum', 'min', 'min', 'min', 'min', 'min', 'min'],
        as: ['__valueSum', 'pw', 'ph', 'ppadL', 'ppadR', 'ppadT', 'ppadB'],
      },
      {type: 'formula', as: '__inW', expr: 'datum.pw - datum.ppadL - datum.ppadR'},
      {type: 'formula', as: '__inH', expr: 'datum.ph - datum.ppadT - datum.ppadB'},
      {type: 'formula', as: '__side', expr: 'min(datum.__inW, datum.__inH)'},
      {type: 'formula', as: '__unit', expr: 'datum.__side * datum.__side / datum.__valueSum'},
      {type: 'joinaggregate', groupby: [group], fields: ['__unit'], ops: ['min'], as: ['__shared']},
    ],
  });

  return [
    {
      type: 'lookup',
      from: `__unitLen${depth}`,
      key: prevCk,
      fields: [prevCk],
      values: ['__shared'],
      as: ['__unit'],
    },
    {type: 'formula', as: '__value', expr: valueExpr(layout)},
    {type: 'formula', as: 'width', expr: 'sqrt(datum.__unit * datum.__value)'},
    {type: 'formula', as: 'height', expr: 'sqrt(datum.__unit * datum.__value)'},
    {
      type: 'formula',
      as: 'relX',
      expr:
        `datum.ppadL + ${margin.left} + ` +
        '0.5 * (datum.pw - datum.width - datum.ppadL - datum.ppadR)',
    },
    // The engine subtracts the parent's *right* padding on the vertical axis
    // here. Faithfully reproduced: changing it would move existing charts.
    {
      type: 'formula',
      as: 'relY',
      expr:
        `datum.ppadT + ${margin.top} + ` +
        '0.5 * (datum.ph - datum.height - datum.ppadT - datum.ppadR)',
    },
  ];
}

/**
 * The padding a container is built with, before any layout stamps its own.
 * `emptyContainersFromKeys` leaves a stray 9px on the bottom; every other
 * constructor starts at zero.
 */
function initialPadding(layout: Layout): Transforms[] {
  const bottom = layout.subgroup.type === 'groupby' ? 9 : 0;
  return [
    {type: 'formula', as: 'padT', expr: '0'},
    {type: 'formula', as: 'padL', expr: '0'},
    {type: 'formula', as: 'padB', expr: `${bottom}`},
    {type: 'formula', as: 'padR', expr: '0'},
  ];
}

/**
 * `calcPackGridxyMaxFillVisualSpaceFunction`: a weighted `maxfill` level is a
 * squarified treemap, which is the one piece of the engine that is a sequence of
 * decisions rather than a reduction, so it stays a transform of its own. See
 * `treemap-transform.ts`.
 */
function treemapGeometry(
  depth: number,
  layout: Layout,
  source: string,
  prevCk: string,
  stamp: Transforms[],
  stampPadding: Transforms[],
): VegaData {
  registerTreemapTransform();
  return {
    name: levelName(depth),
    source,
    transform: [
      // A treemap level reads its weight off the first row of each child, so it
      // expects a `flatten` above it, where each child holds exactly one row.
      {type: 'lookup', from: ROWS_BY_ID, key: 'id', fields: ['firstId'], as: ['__first']},
      {
        type: 'formula',
        as: '__weight',
        expr: `datum.__first ? toNumber(datum.__first[${JSON.stringify(layout.size!.key)}]) : NaN`,
      },
      {
        type: TREEMAP_TRANSFORM,
        groupby: prevCk,
        weight: '__weight',
        box: ['pw', 'ph'],
        as: ['relX', 'relY', 'width', 'height'],
      } as unknown as Transforms,
      ...stamp,
      ...stampPadding,
    ],
  };
}
