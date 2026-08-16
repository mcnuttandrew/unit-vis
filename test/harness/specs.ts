/**
 * The example specs in `src/specs` double as the test corpus: they are the
 * charts the app itself ships, so backend parity on them is what matters.
 * Globbing the JSON directly means a spec added to the app is a spec the
 * parity suite covers, with no list to keep in step.
 */
import type {Spec} from '@unit-vis/core';

const modules = import.meta.glob<Spec>('../../apps/playground/src/specs/*.json', {eager: true, import: 'default'});

export interface NamedSpec {
  name: string;
  spec: Spec;
}

export const ALL_SPECS: NamedSpec[] = Object.entries(modules)
  .map(([path, spec]) => ({name: path.split('/').pop()!.replace(/\.json$/, ''), spec}))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * A small, fast subset that still covers the interesting axes: circle vs rect
 * marks, shared vs isolated sizing, nesting depth, and a spec with no layouts.
 */
export const CORE_SPEC_NAMES = [
  'default1',
  'unit_column_chart',
  'unit_column_chart_shared',
  'unit_column_chart_shared_mark',
  'mosaic',
  'titanic_spec1',
  'size_uniform_shared',
  'size_sum_notShared',
  'square_aspect',
];

export const CORE_SPECS: NamedSpec[] = CORE_SPEC_NAMES.map(name => {
  const found = ALL_SPECS.find(s => s.name === name);
  if (!found) {
    throw new Error(`unknown spec in CORE_SPEC_NAMES: ${name}`);
  }
  return found;
});

/**
 * A copy of `spec` with `labels` and `legend` off.
 *
 * The example specs ask for a legend, which only the vega backend draws and
 * which sits outside the plot area. Anything measuring the two backends against
 * each other, or measuring what turning a decoration on does, has to start from
 * a chart with no decorations on it -- otherwise the baseline already carries
 * the thing being tested.
 */
export function withoutDecorations(spec: Spec): Spec {
  const copy = JSON.parse(JSON.stringify(spec)) as Spec;
  delete copy.labels;
  delete copy.legend;
  return copy;
}
