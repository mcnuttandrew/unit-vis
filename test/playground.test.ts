import {afterEach, beforeAll, describe, expect, it} from 'vitest';
import {act, createElement} from 'react';
import {createRoot, type Root as ReactRoot} from 'react-dom/client';

import Editor from '../src/Editor';
import Root from '../src/root';
import {defaultSpecName, options} from '../src/specs';

/**
 * Guards the playground shell rather than the drawing backends: that the
 * codemirror extension set still composes into a live editor (a mismatched
 * pair of @codemirror/* majors makes `EditorState.create` throw, which took
 * the whole page down), and that the editor and the spec state stay in sync.
 */

(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: {root: ReactRoot; host: HTMLElement}[] = [];

async function mount(element: Parameters<ReactRoot['render']>[0]): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({root, host});
  // `act` returns a bespoke thenable rather than a promise, so it has to be
  // awaited outright -- chaining `.then` off it yields undefined.
  await act(async () => {
    root.render(element);
  });
  return host;
}

beforeAll(() => {
  // jsdom implements neither of these, and codemirror measures with both.
  const stub = () => ({top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0});
  (Range.prototype as unknown as {getClientRects: () => unknown}).getClientRects = () => [];
  (Range.prototype as unknown as {getBoundingClientRect: () => unknown}).getBoundingClientRect = stub;
});

// Every mount must come down between tests: two live copies of the playground
// means two elements sharing an id, and jsdom's selector engine resolves a
// scoped `#id ...` lookup against the first one in the document.
afterEach(() => {
  while (mounted.length) {
    const {root, host} = mounted.pop()!;
    act(() => root.unmount());
    host.remove();
  }
});

describe('Editor', () => {
  it('renders a codemirror instance holding the code it was given', async () => {
    const host = await mount(createElement(Editor, {code: '{"a": 1}', onChange: () => undefined}));

    expect(host.querySelector('.cm-editor')).toBeTruthy();
    expect(host.querySelector('.cm-content')?.textContent).toContain('"a": 1');
  });

  it('syncs a new code prop into the document without echoing it back out', async () => {
    const seen: string[] = [];
    const host = await mount(createElement(Editor, {code: '{"a": 1}', onChange: (t: string) => seen.push(t)}));

    await act(async () => {
      mounted[0].root.render(
        createElement(Editor, {code: '{"b": 2}', onChange: (t: string) => seen.push(t)}),
      );
    });

    expect(host.querySelector('.cm-content')?.textContent).toContain('"b": 2');
    expect(seen).toEqual([]);
  });
});

describe('playground', () => {
  it('mounts with a spec already loaded and no parse error', async () => {
    const host = await mount(createElement(Root));

    expect(host.querySelector('.default-chooser select')).toBeTruthy();
    expect(host.querySelector('#spec-editor .cm-editor')).toBeTruthy();
    expect(host.querySelector('#old-target')).toBeTruthy();
    expect(host.querySelector('#new-target')).toBeTruthy();
    // The editor starts on the spec the chooser is showing, not on `{}`.
    expect(host.querySelector('.cm-content')?.textContent).toContain('layouts');
    expect(host.querySelector('.error-bar')).toBeNull();
  });
});

describe('hash routing', () => {
  // jsdom carries the location across tests in a file, so each of these has to
  // state the hash it starts from rather than inherit the last one's.
  const setHash = (hash: string) => window.history.replaceState(null, '', hash || '#');
  const chooser = (host: HTMLElement) => host.querySelector<HTMLSelectElement>('.default-chooser select')!;
  const button = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll('button')].find(b => b.textContent === label)!;
  // jsdom queues hashchange as a task rather than firing it inline, so a click
  // that navigates has not reached the subscription until the loop turns over.
  const click = (el: HTMLElement) =>
    act(async () => {
      el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
      await new Promise(resolve => setTimeout(resolve, 0));
    });

  afterEach(() => setHash(''));

  it('loads the spec named in the hash', async () => {
    setHash('#/violin');
    const host = await mount(createElement(Root));

    // Codemirror renders only the lines in view and drops the newlines between
    // them, so match the opening of the document with whitespace collapsed.
    const collapse = (text: string) => text.replace(/\s+/g, ' ');
    const violin = options.find(({name}) => name === 'violin')!;
    expect(chooser(host).value).toBe('violin');
    expect(collapse(host.querySelector('.cm-content')!.textContent!)).toContain(
      collapse(violin.text).slice(0, 60),
    );
  });

  it('normalizes an absent or unknown hash to the default spec', async () => {
    setHash('#/not-a-spec');
    const host = await mount(createElement(Root));

    expect(window.location.hash).toBe(`#/${defaultSpecName}`);
    expect(chooser(host).value).toBe(defaultSpecName);
  });

  it('follows the hash when it changes underneath it, as the back button does', async () => {
    setHash('#/violin');
    const host = await mount(createElement(Root));

    await act(async () => {
      window.history.replaceState(null, '', '#/mosaic');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(chooser(host).value).toBe('mosaic');
  });

  it('steps the hash through the option list with prev/next, wrapping at both ends', async () => {
    setHash(`#/${options[0].name}`);
    const host = await mount(createElement(Root));

    await click(button(host, 'Prev'));
    expect(window.location.hash).toBe(`#/${options[options.length - 1].name}`);
    expect(chooser(host).value).toBe(options[options.length - 1].name);

    await click(button(host, 'Next'));
    expect(window.location.hash).toBe(`#/${options[0].name}`);
    expect(chooser(host).value).toBe(options[0].name);
  });
});
