import {useEffect, useRef, useState} from 'react';
import type {JSX} from 'react';

import {basicSetup} from 'codemirror';
import {EditorState} from '@codemirror/state';
import {EditorView, hoverTooltip, keymap} from '@codemirror/view';
import type {ViewUpdate} from '@codemirror/view';
import {linter, lintGutter} from '@codemirror/lint';
import {json, jsonParseLinter, jsonLanguage} from '@codemirror/lang-json';
import {indentWithTab} from '@codemirror/commands';
import type {JSONSchema7} from 'json-schema';

import schema from '@unit-vis/core/schema';

import {
  jsonSchemaLinter,
  jsonSchemaHover,
  jsonCompletion,
  stateExtensions,
  handleRefresh,
} from 'codemirror-json-schema';

interface Props {
  onChange: (x: string) => void;
  code: string;
}

/**
 * Only what it takes to seat CodeMirror in the surrounding paper: its own
 * defaults draw a white slab with a gray gutter and a blue active line, none of
 * which belong to this palette. Colors track the tokens in index.css.
 */
const editorTheme = EditorView.theme({
  '&': {
    color: 'var(--ink)',
    backgroundColor: 'var(--panel)',
    fontSize: '12.5px',
  },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    padding: '10px 0',
    caretColor: 'var(--accent)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--panel)',
    color: '#b8b5a6',
    border: 'none',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
  },
  '.cm-lineNumbers .cm-gutterElement': {padding: '0 8px 0 12px'},
  '.cm-activeLine': {backgroundColor: '#faf9f4'},
  '.cm-activeLineGutter': {backgroundColor: '#faf9f4', color: 'var(--ink-3)'},
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-wash)',
  },
  '&.cm-focused': {outline: 'none'},
  '&.cm-focused .cm-cursor': {borderLeftColor: 'var(--accent)'},
  '.cm-foldPlaceholder': {
    backgroundColor: '#efedE4',
    border: '1px solid var(--rule-2)',
    color: 'var(--ink-3)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--rule-2)',
    borderRadius: '5px',
    backgroundColor: 'var(--panel)',
    boxShadow: '0 6px 18px -10px rgba(22, 21, 15, 0.45)',
    fontFamily: 'var(--font-ui)',
    fontSize: '12.5px',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent-wash)',
    color: 'var(--ink)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--panel)',
    color: 'var(--ink)',
    borderColor: 'var(--rule)',
  },
});

export default function Editor(props: Props): JSX.Element {
  const {onChange, code} = props;
  const cmParent = useRef<HTMLDivElement | null>(null);

  // The updateListener below is installed once, on mount, so it captures the
  // `onChange` from that first render forever. Route the call through a ref
  // that every render refreshes so a changed callback is still honored.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // CodeMirror's updateListener fires for *every* doc change, including
  // ones this component itself dispatches below to sync a programmatic
  // `code` prop update -- not just genuine user keystrokes. Without this
  // guard, every programmatic sync round-trips straight back out through
  // `onChange` (e.g. the generated-JS editor's `onChange` calls
  // `setGeneratedText`, which is exactly the state that just produced this
  // same `code` prop), needlessly re-triggering everything downstream of
  // it (a full iframe reload, re-running the whole compiled program) once
  // or twice extra per real change. Confirmed directly: a spec with a
  // large dataset (geo_circle.vl.json, ~42k rows) reloaded its preview
  // iframe 4 times for a single spec selection instead of the expected 1,
  // each reload repeating the full data-fetch-and-render pipeline --
  // consistent user reports of the page "crashing" on this spec traced
  // back to exactly this loop.
  const isProgrammaticUpdate = useRef(false);

  const [view, setView] = useState<EditorView | null>(null);

  useEffect(() => {
    const editorView = new EditorView({
      state: EditorState.create({
        doc: code,
        extensions: [
          basicSetup,
          editorTheme,
          json(),
          linter(jsonParseLinter(), {
            // default is 750ms
            delay: 300,
          }),
          linter(jsonSchemaLinter(), {
            needsRefresh: handleRefresh,
          }),
          lintGutter(),
          keymap.of([indentWithTab]),
          jsonLanguage.data.of({
            autocomplete: jsonCompletion(),
          }),
          hoverTooltip(jsonSchemaHover()),
          EditorView.updateListener.of((v: ViewUpdate) => {
            if (v.docChanged && !isProgrammaticUpdate.current) {
              onChangeRef.current(v.state.doc.toString());
            }
          }),
          EditorView.lineWrapping,
          stateExtensions(schema as JSONSchema7),
        ],
      }),
      parent: cmParent.current!,
    });
    setView(editorView);
    return () => editorView.destroy();
    // Mounting is a one-time effect; `code` is synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!view) {
      return;
    }
    // Compare against the document itself rather than a mirrored copy in
    // state: the document is what the next dispatch is measured against, so
    // a stale mirror would produce an out-of-range replacement range.
    if (view.state.doc.toString() === code) {
      return;
    }
    isProgrammaticUpdate.current = true;
    view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: code}});
    isProgrammaticUpdate.current = false;
  }, [code, view]);

  return <div id="spec-editor" className="editor-host" ref={cmParent} />;
}
