/**
 * unit-vis with the vega backend: the spec is compiled into a vega dataflow
 * that lays the chart out and draws it. Only this backend draws the axes
 * `spec.labels` asks for, or `spec.legend`.
 *
 * Nothing but the rows crosses into vega, so the compiled spec is the whole
 * chart -- `buildVegaSpec` hands one back to serialize, embed, or drive with
 * signals. The grammar and its types come from `@unit-vis/core` and are
 * re-exported here; the JS layout engine there is what the d3 backend draws
 * from, and what `test/backend-parity.test.ts` holds this compiler against.
 *
 * `vega` and `vega-tooltip` are the dependencies.
 */
import {applyDefault, fetchData} from '@unit-vis/core';
import type {DataRow, Spec} from '@unit-vis/core';
import drawUnitVega from './drawing.js';
import type {View} from 'vega';

/** Resolve a spec's rows, from `data.url` or `data.values`. */
export function loadRows(spec: Spec): Promise<DataRow[] | null> {
  if (!spec.data) {
    return Promise.resolve(null);
  }
  return spec.data.url ? fetchData(spec.data.url) : Promise.resolve(spec.data.values ?? []);
}

/**
 * Draw `spec` into the element with id `divId`.
 *
 * Resolves with the live vega `View` once the chart is on the page, or with
 * `null` for a spec with no data. Hold onto the view to drive the chart after
 * the fact -- `view.signal('markShape', 'rect').runAsync()` reshapes the marks,
 * `view.toImageURL('png')` exports it -- and call `view.finalize()` when you
 * tear the chart down.
 *
 * Note that this fills the spec's defaults in on the object it is handed, so
 * pass a copy if you mean to keep the original as written.
 */
export function UnitChart(divId: string, spec: Spec): Promise<View | null> {
  applyDefault(spec);
  return loadRows(spec).then(rows => (rows ? drawUnitVega(spec, rows, divId) : null));
}

export default UnitChart;

export {default as drawUnitVega, buildVegaSpec, isPortable} from './drawing.js';
export {buildLayoutData, levelName} from './layout.js';
export {TREEMAP_TRANSFORM, registerTreemapTransform} from './treemap-transform.js';
export {SHELF_TRANSFORM, registerShelfTransform} from './shelf-transform.js';
export * from '@unit-vis/core';
