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
      <section className="backend-card">
        <header className="backend-card__header">
          <span className="label">d3 backend</span>
          <span className="backend-card__pkg">unit-vis</span>
        </header>
        <div className="backend-card__body">
          {!spec && <p className="empty-note">waiting on a spec that parses</p>}
          <div id="d3-target" ref={d3Target} />
        </div>
      </section>
      <section className="backend-card">
        <header className="backend-card__header">
          <span className="label">vega backend</span>
          <span className="backend-card__pkg">unit-vis-vega</span>
        </header>
        <div className="backend-card__body">
          {!spec && <p className="empty-note">waiting on a spec that parses</p>}
          <div id="vega-target" ref={vegaTarget} />
        </div>
      </section>
    </div>
  );
}
