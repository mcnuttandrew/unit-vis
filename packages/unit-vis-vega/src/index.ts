/**
 * unit-vis with the vega backend: the container tree is handed to a vega
 * dataflow, which descends it, accumulates absolute positions, and draws the
 * boxes and unit marks. Only this backend draws `spec.labels` and
 * `spec.legend`.
 *
 * `vega` is the one dependency. The grammar, the layout engine, and the types
 * come from `@unit-vis/core`, which has none, and are re-exported here.
 */
import {loadScene} from '@unit-vis/core';
import type {Spec} from '@unit-vis/core';
import drawUnitVega from './drawing.js';
import type {View} from 'vega';

/**
 * Draw `spec` into the element with id `divId`.
 *
 * Resolves with the live vega `View` once the chart is on the page, or with
 * `null` for a spec with no data. Hold onto the view to drive the chart after
 * the fact -- `view.signal('markShape', 'rect').runAsync()` reshapes the marks,
 * `view.toImageURL('png')` exports it -- and call `view.finalize()` when you
 * tear the chart down.
 */
export function UnitChart(divId: string, spec: Spec): Promise<View | null> {
  return loadScene(spec).then(scene => {
    if (!scene) {
      return null;
    }
    return drawUnitVega(scene.rootContainer, spec, divId);
  });
}

export default UnitChart;

export {default as drawUnitVega, buildVegaSpec} from './drawing.js';
export * from '@unit-vis/core';
