import {useEffect, useRef} from 'react';

import UnitVis from '../library/index';
import type {Spec} from '../library/index.d';

interface Props {
  spec?: Spec;
}

/**
 * Every keystroke that leaves the editor holding valid JSON produces a new
 * spec, and a render is expensive -- it can fetch a csv and lay out tens of
 * thousands of marks twice over (once per backend). Wait for typing to settle
 * instead of racing a full pipeline per character.
 */
const RENDER_DEBOUNCE_MS = 300;

export default function Chart(props: Props) {
  const {spec} = props;
  const oldTarget = useRef<HTMLDivElement | null>(null);
  const newTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Empty the hosts rather than removing the <svg> alone: vega-embed mounts
    // a `.vega-embed` wrapper (plus its actions menu) around the svg, so
    // pulling just the svg out leaves the wrapper behind to accumulate one
    // stale layer per spec change.
    const targets = [oldTarget.current, newTarget.current];
    const handle = setTimeout(() => {
      targets.forEach(target => target && (target.innerHTML = ''));
      if (spec) {
        UnitVis('old-target', spec, {backend: 'old'});
        UnitVis('new-target', spec, {backend: 'vega'});
      }
    }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [spec]);

  return (
    <div className="flex-down chart-container">
      <div className="flex-down">
        <span>Old backend</span>
        <div id="old-target" ref={oldTarget} />
      </div>
      <div className="flex-down">
        <span>New backend</span>
        <div id="new-target" ref={newTarget} />
      </div>
    </div>
  );
}
