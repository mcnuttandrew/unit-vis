/**
 * Hovering a unit shows its row.
 *
 * The mark encoding (`tooltip: datum.row`) is only half of it: something has to
 * be installed as the view's tooltip handler to draw the value, or vega falls
 * back to writing it into the container's `title` attribute. That fallback is
 * what the chart quietly degraded to when `vega-embed` -- which brought
 * `vega-tooltip` with it -- was dropped, so this drives the real path: a live
 * view in the document, a pointer over a unit, and the tooltip element that
 * should follow.
 */
import {describe, expect, it} from 'vitest';
import {drawUnitVega} from 'unit-vis-vega';
import {buildSceneForSpec} from './harness/render';
import {ALL_SPECS} from './harness/specs';

/** A flatten over the titanic rows: every row is a unit, and the fields are recognizable. */
const SPEC = 'default1';
const TOOLTIP_ID = 'vg-tooltip-element';

/** Draw a chart into the document and hover the first unit mark in it. */
async function hoverAUnit(): Promise<void> {
  const {spec} = ALL_SPECS.find(s => s.name === SPEC)!;
  const scene = buildSceneForSpec(spec, 20);
  // One host per test: `drawUnitVega` finds its target by id, so a leftover
  // div from the test before would be the one it drew into.
  document.getElementById('tooltip-target')?.remove();
  const target = document.createElement('div');
  target.id = 'tooltip-target';
  document.body.appendChild(target);
  await drawUnitVega(scene.spec, scene.data, target.id);
  // The unit marks specifically: the container boxes carry no tooltip, and a
  // pointer over one of those is meant to show nothing.
  const unit = target.querySelector('g.unitMarks path, g.unitArcMarks path');
  expect(unit).toBeTruthy();
  unit!.dispatchEvent(new window.MouseEvent('pointermove', {bubbles: true, clientX: 40, clientY: 40}));
}

describe('the tooltip', () => {
  it('shows the hovered row', async () => {
    await hoverAUnit();
    const tooltip = document.getElementById(TOOLTIP_ID);
    expect(tooltip).toBeTruthy();
    expect(tooltip!.classList.contains('visible')).toBe(true);
    // Field names off the source row, not the layout's bookkeeping.
    const keys = Array.from(tooltip!.querySelectorAll('td.key')).map(td => td.textContent);
    expect(keys).toContain('name');
    expect(keys).toContain('survived');
    expect(keys.filter(key => key && key.startsWith('ck'))).toEqual([]);
  });

  it('hides again when the pointer leaves', async () => {
    await hoverAUnit();
    const tooltip = document.getElementById(TOOLTIP_ID)!;
    const unit = document.querySelector('g.unitMarks path, g.unitArcMarks path')!;
    unit.dispatchEvent(new window.MouseEvent('mouseout', {bubbles: true}));
    expect(tooltip.classList.contains('visible')).toBe(false);
  });
});
