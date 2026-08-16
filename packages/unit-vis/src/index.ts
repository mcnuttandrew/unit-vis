/**
 * unit-vis with the d3 backend: one `<g>` per container per layout level, and a
 * `<circle>` or `<rect>` per data row, appended through `d3-selection`.
 *
 * The grammar, the layout engine, and the types all live in `@unit-vis/core`
 * and are re-exported here, so this package is the whole d3 story. For the same
 * grammar drawn by vega -- and for `labels` and `legend`, which this backend
 * ignores -- see `unit-vis-vega`.
 */
import {loadScene} from '@unit-vis/core';
import type {Spec} from '@unit-vis/core';
import {drawUnit} from './drawing.js';

/**
 * Draw `spec` into the element with id `divId`.
 *
 * Resolves once the chart is on the page. Data named by `spec.data.url` is
 * fetched first, so that is not synchronous with the call.
 */
export function UnitChart(divId: string, spec: Spec): Promise<void> {
  return loadScene(spec).then(scene => {
    if (!scene) {
      return;
    }
    drawUnit(scene.rootContainer, spec, scene.layoutList, divId);
  });
}

export default UnitChart;

export {drawUnit} from './drawing.js';
export * from '@unit-vis/core';
