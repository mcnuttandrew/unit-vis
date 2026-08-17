import UnitVisD3 from 'unit-vis';
import UnitVisVega from 'unit-vis-vega';
import type {Spec} from '@unit-vis/core';

export interface Backend {
  key: string;
  /** Short name, used both on the card and on the toggle that hides it. */
  name: string;
  pkg: string;
  targetId: string;
  render: (targetId: string, spec: Spec) => void;
}

/** The one list both the chart panel and its toggles are built from. */
export const BACKENDS: Backend[] = [
  {
    key: 'd3',
    name: 'd3',
    pkg: 'unit-vis',
    targetId: 'd3-target',
    render: UnitVisD3,
  },
  {
    key: 'vega',
    name: 'vega',
    pkg: 'unit-vis-vega',
    targetId: 'vega-target',
    render: UnitVisVega,
  },
];

/** Which backends draw, keyed by `Backend.key`. */
export type EnabledBackends = Record<string, boolean>;

const STORAGE_KEY = 'unit-vis:enabled-backends';

/** All on: comparing the backends against each other is the point of the page. */
export function defaultEnabled(): EnabledBackends {
  return Object.fromEntries(BACKENDS.map(({key}) => [key, true]));
}

/**
 * The toggles as last left, from a previous visit.
 *
 * Keyed off `BACKENDS` rather than off what was stored, so a backend added
 * since the write starts on and one dropped since doesn't linger. Storage can
 * throw outright (Safari in private mode) and can hold anything at all if it
 * was written by hand, so anything short of a usable object falls back to the
 * default rather than hiding a chart the reader didn't ask to hide.
 */
export function loadEnabled(): EnabledBackends {
  let stored: unknown;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultEnabled();
    }
    stored = JSON.parse(raw);
  } catch {
    return defaultEnabled();
  }
  if (!stored || typeof stored !== 'object') {
    return defaultEnabled();
  }
  const saved = stored as Record<string, unknown>;
  return Object.fromEntries(
    BACKENDS.map(({key}) => [key, typeof saved[key] === 'boolean' ? saved[key] : true]),
  );
}

export function saveEnabled(enabled: EnabledBackends): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  } catch {
    // Blocked or full. The toggles still work for this visit, they just won't
    // be there on the next one -- not worth interrupting the page over.
  }
}
