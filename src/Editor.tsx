import * as React from 'react';
import {useEffect, useRef, useState} from 'react';

import {basicSetup, EditorState} from '@codemirror/basic-setup';
import {EditorView, ViewUpdate, keymap} from '@codemirror/view';
import {javascript} from '@codemirror/lang-javascript';
import {json} from '@codemirror/lang-json';
import {indentWithTab} from '@codemirror/commands';

interface Props {
  onChange: (x: string) => void;
  code: string;
  language: string;
}

export default function Editor(props: Props): JSX.Element {
  const {onChange, code, language} = props;
  const cmParent = useRef<HTMLDivElement>();
  const [localTxt, setLocalTxt] = useState('');
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
  const [state, setState] = useState(null);

  useEffect(() => {
    const editorState = EditorState.create({
      extensions: [
        basicSetup,
        language === 'javascript' ? javascript() : json(),
        keymap.of([indentWithTab]),
        EditorView.updateListener.of((v: ViewUpdate) => {
          if (v.docChanged) {
            const txt = v.state.doc.sliceString(0);
            setLocalTxt(txt);
            if (!isProgrammaticUpdate.current) {
              onChange(txt);
            }
          }
        }),
        EditorView.lineWrapping,
      ],
    });
    setState(editorState);
    setView(new EditorView({state: editorState, parent: cmParent.current!}));
  }, []);

  useEffect(() => {
    if (localTxt !== code && view) {
      isProgrammaticUpdate.current = true;
      view.dispatch({changes: {from: 0, to: localTxt.length, insert: ''}});
      view.dispatch({changes: {from: 0, to: 0, insert: code}});
      isProgrammaticUpdate.current = false;
    }
  }, [code]);

  return <div id={`${language}-editor`} className="editor-host" ref={cmParent} />;
}
