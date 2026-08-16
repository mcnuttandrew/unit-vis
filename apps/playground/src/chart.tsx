import {useEffect, useRef} from 'react';

import UnitVisD3 from 'unit-vis';
import UnitVisVega from 'unit-vis-vega';
import type {Spec} from '@unit-vis/core';

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
  const d3Target = useRef<HTMLDivElement | null>(null);
  const vegaTarget = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Empty the hosts rather than removing the <svg> alone: vega mounts its own
    // wrapper element around the svg, so pulling just the svg out leaves the
    // wrapper behind to accumulate one stale layer per spec change.
    const targets = [d3Target.current, vegaTarget.current];
    const handle = setTimeout(() => {
      targets.forEach(target => target && (target.innerHTML = ''));
      if (spec) {
        // Each backend gets its own copy: laying a chart out fills the spec's
        // defaults in and links its layouts up, so the two would otherwise be
        // reading and writing one object.
        UnitVisD3('d3-target', structuredClone(spec));
        UnitVisVega('vega-target', structuredClone(spec));
      }
    }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [spec]);

  return (
    <div className="flex-down chart-container">
      <div className="flex-down">
        <span>d3 backend (unit-vis)</span>
        <div id="d3-target" ref={d3Target} />
      </div>
      <div className="flex-down">
        <span>vega backend (unit-vis-vega)</span>
        <div id="vega-target" ref={vegaTarget} />
      </div>
    </div>
  );
}
