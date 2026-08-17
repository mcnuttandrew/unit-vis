import {useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode} from 'react';
import {options} from './specs';
import type {SpecOption} from './specs';
import {ChevronLeft, ChevronRight, Dice, Search} from './icons';
import {classnames} from './utils';

interface Props {
  specName: string;
  setSpecName: (name: string) => void;
  /** Trailing slot in the toolbar, for controls that act on the spec itself. */
  children?: ReactNode;
}

interface Match {
  option: SpecOption;
  /** Which characters of the name the query matched, for the highlight. */
  hits: number[];
}

/**
 * Subsequence match: every character of the query has to turn up in the name in
 * order, but not next to each other, which is what lets `pengmos` find
 * `penguins_island_species_mosaic`. Contiguous matches still win the sort
 * below, so plain substring typing behaves the way it looks like it should.
 */
function fuzzyMatch(name: string, query: string): number[] | null {
  const hits: number[] = [];
  let from = 0;
  for (const char of query) {
    const at = name.indexOf(char, from);
    if (at === -1) {
      return null;
    }
    hits.push(at);
    from = at + 1;
  }
  return hits;
}

/** How spread out a match is; a substring hit spans exactly its own length. */
const span = (hits: number[]) => hits[hits.length - 1] - hits[0];

function Highlighted({name, hits}: {name: string; hits: number[]}) {
  if (!hits.length) {
    return <>{name}</>;
  }
  // Runs rather than one element per character: these lists are long enough
  // that a node per letter is a real cost for no visible difference.
  const hit = new Set(hits);
  const runs: {text: string; on: boolean}[] = [];
  for (let i = 0; i < name.length; i++) {
    const on = hit.has(i);
    const last = runs[runs.length - 1];
    if (last && last.on === on) {
      last.text += name[i];
    } else {
      runs.push({text: name[i], on});
    }
  }
  return (
    <>
      {runs.map((run, i) => (run.on ? <mark key={i}>{run.text}</mark> : <span key={i}>{run.text}</span>))}
    </>
  );
}

export default function DefaultChooser(props: Props) {
  const {specName, setSpecName, children} = props;
  // An unknown name (a bad hash, mid-normalization) still has to render
  // something, and the first option is what the app falls back to anyway.
  const currentIndex = Math.max(
    0,
    options.findIndex(({name}) => name === specName),
  );
  const step = (offset: number) =>
    setSpecName(options[(currentIndex + offset + options.length) % options.length].name);

  // Picking from the whole list minus the current one, rather than rerolling
  // until it differs, so the button always actually goes somewhere.
  const random = () => {
    const offset = 1 + Math.floor(Math.random() * (options.length - 1));
    setSpecName(options[(currentIndex + offset) % options.length].name);
  };

  // `null` means the box is showing the loaded spec's name rather than a
  // search: the field is a label until the moment someone types into it.
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activeRef = useRef<HTMLLIElement | null>(null);

  const matches: Match[] = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase();
    if (!q) {
      return options.map(option => ({option, hits: []}));
    }
    return options
      .map(option => ({option, hits: fuzzyMatch(option.name.toLowerCase(), q)}))
      .filter((match): match is Match => match.hits !== null)
      .sort(
        (a, b) =>
          span(a.hits) - span(b.hits) ||
          a.hits[0] - b.hits[0] ||
          a.option.name.localeCompare(b.option.name),
      );
  }, [query]);

  useEffect(() => {
    if (open) {
      activeRef.current?.scrollIntoView({block: 'nearest'});
    }
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const choose = (match?: Match) => {
    if (match) {
      setSpecName(match.option.name);
    }
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setActive(prev => (prev + delta + matches.length) % Math.max(matches.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(matches[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="toolbar">
      <span className="label">Example</span>
      <div className="select-shell">
        <span className="select-shell__icon">
          <Search />
        </span>
        <input
          ref={inputRef}
          className="combo-input"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="example-list"
          aria-autocomplete="list"
          aria-activedescendant={
            open && matches[active] ? `example-${matches[active].option.name}` : undefined
          }
          aria-label="Example spec"
          spellCheck={false}
          autoComplete="off"
          placeholder="search examples"
          value={query ?? options[currentIndex].name}
          onChange={({target: {value}}) => {
            setQuery(value);
            setOpen(true);
            // The list reshuffles under the highlight on every keystroke, so
            // it goes back to the best match rather than to whatever row
            // happens to be sitting at the old index.
            setActive(0);
          }}
          onFocus={e => {
            // Select rather than clear, so the box still says which spec is
            // loaded while the first keystroke replaces it wholesale.
            e.target.select();
            setActive(currentIndex);
            setOpen(true);
          }}
          // A click on an already-focused input fires no focus event, so
          // without this the list would not reopen after picking from it.
          onClick={() => setOpen(true)}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        {open && (
          <ul
            className="combo-list"
            id="example-list"
            role="listbox"
            // Dragging the list's own scrollbar would otherwise blur the input
            // and close the list mid-drag.
            onMouseDown={e => e.preventDefault()}
          >
            {matches.map((match, i) => (
              <li
                key={match.option.name}
                id={`example-${match.option.name}`}
                ref={i === active ? activeRef : undefined}
                role="option"
                aria-selected={match.option.name === specName}
                className={classnames({
                  'combo-option': true,
                  'is-active': i === active,
                  'is-current': match.option.name === specName,
                })}
                // The click lands after the input's blur would have closed the
                // list out from under it, so take the selection on mousedown.
                onMouseDown={e => {
                  e.preventDefault();
                  choose(match);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <Highlighted name={match.option.name} hits={match.hits} />
              </li>
            ))}
            {!matches.length && <li className="combo-empty">no example matches that</li>}
          </ul>
        )}
      </div>
      <span className="counter">
        {currentIndex + 1}/{options.length}
      </span>
      <div className="button-group">
        <button
          className="icon-button"
          onClick={() => step(-1)}
          title="Previous example"
          aria-label="Previous example"
        >
          <ChevronLeft />
        </button>
        <button
          className="icon-button"
          onClick={() => step(1)}
          title="Next example"
          aria-label="Next example"
        >
          <ChevronRight />
        </button>
      </div>
      <button className="icon-button" onClick={random} title="Random example" aria-label="Random example">
        <Dice />
      </button>
      {children}
    </div>
  );
}
