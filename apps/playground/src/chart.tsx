import {useEffect, useRef} from 'react';

import type {Spec} from '@unit-vis/core';
import {BACKENDS} from './backends';
import type {Backend, EnabledBackends} from './backends';

interface Props {
  spec?: Spec;
  enabled: EnabledBackends;
}

/**
 * Every keystroke that leaves the editor holding valid JSON produces a new
 * spec, and a render is expensive -- it can fetch a csv and lay out tens of
 * thousands of marks. Wait for typing to settle instead of racing a full
 * pipeline per character.
 */
const RENDER_DEBOUNCE_MS = 300;

/**
 * One card, drawing itself. Each backend owning its own effect means toggling
 * one off doesn't redraw the other, and unmounting is all it takes to clear a
 * hidden one -- there is no leftover to clean up.
 */
function BackendCard(props: {backend: Backend; spec?: Spec}) {
  const {backend, spec} = props;
  const target = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      const el = target.current;
      if (!el) {
        return;
      }
      // Empty the host rather than removing the <svg> alone: vega mounts its
      // own wrapper element around the svg, so pulling just the svg out leaves
      // the wrapper behind to accumulate one stale layer per spec change.
      el.innerHTML = '';
      if (spec) {
        // The backend gets its own copy: laying a chart out fills the spec's
        // defaults in and links its layouts up, so two backends would
        // otherwise be reading and writing one object.
        backend.render(backend.targetId, structuredClone(spec));
      }
    }, RENDER_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [spec, backend]);

  return (
    <section className="backend-card">
      <header className="backend-card__header">
        <span className="label">{backend.name} backend</span>
        <span className="backend-card__pkg">{backend.pkg}</span>
      </header>
      <div className="backend-card__body">
        {!spec && <p className="empty-note">waiting on a spec that parses</p>}
        <div id={backend.targetId} ref={target} />
      </div>
    </section>
  );
}

export default function Chart(props: Props) {
  const {spec, enabled} = props;
  const shown = BACKENDS.filter(backend => enabled[backend.key]);

  return (
    <div className="flex-down chart-container">
      {!shown.length && <p className="empty-note">every backend is toggled off</p>}
      {shown.map(backend => (
        <BackendCard key={backend.key} backend={backend} spec={spec} />
      ))}
    </div>
  );
}
