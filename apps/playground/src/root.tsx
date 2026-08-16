import {useCallback, useEffect, useMemo, useState} from 'react';
import Chart from './chart';
import DefaultChooser from './default-chooser';
import {defaultSpecName, options} from './specs';
import Editor from './Editor';
import type {Spec} from '@unit-vis/core';
import {classnames} from './utils';
import {useHashRoute} from './use-hash-route';

const defaultSpec = options.find(({name}) => name === defaultSpecName)!;

export default function Root() {
  // The hash owns which spec is loaded, so every route into one -- the chooser,
  // prev/next, the back button, a pasted link -- goes through the same place.
  const [specName, setSpecName] = useHashRoute();
  const [showAbout, setAbout] = useState(false);

  const selectedSpec = options.find(({name}) => name === specName) ?? defaultSpec;

  // An absent or unrecognized hash gets rewritten to the spec actually on
  // screen, so the URL always names the view. Replacing rather than pushing
  // keeps that correction out of the back button's way.
  useEffect(() => {
    setSpecName(selectedSpec.name, true);
  }, [selectedSpec, setSpecName]);

  // Edits are tagged with the spec they were made against, so selecting a
  // different spec shows that spec rather than the previous one's leftovers --
  // without an effect racing the render to clear them.
  const [edit, setEdit] = useState<{name: string; text: string} | null>(null);
  const code = edit?.name === selectedSpec.name ? edit.text : selectedSpec.text;
  const changeSpec = useCallback(
    (text: string) => setEdit({name: selectedSpec.name, text}),
    [selectedSpec],
  );

  // The parse result and the error message come from the same attempt, so the
  // error bar can never disagree with what the chart is showing.
  const {parsedCode, parseError} = useMemo(() => {
    try {
      return {parsedCode: JSON.parse(code) as Spec, parseError: null};
    } catch (e) {
      return {parsedCode: null, parseError: (e as Error).message};
    }
  }, [code]);

  return (
    <div className="appbody">
      <div className="header">
        <h1>Unit Vis</h1>
      </div>
      <div className="flex main-content">
        <div className="flex-down left-column">
          <DefaultChooser specName={selectedSpec?.name ?? defaultSpecName} setSpecName={setSpecName} />
          <Editor onChange={changeSpec} code={code} />
          {parseError && <div className="error-bar">{parseError}</div>}
        </div>
        <div className="right-column">
          <div className="chart-panel-controls">
            <div
              className={classnames({
                'chart-option': true,
                'selected-chart-option': !showAbout,
              })}
              onClick={() => setAbout(false)}
            >
              Chart
            </div>
            <div
              className={classnames({
                'chart-option': true,
                'selected-chart-option': showAbout,
              })}
              onClick={() => setAbout(true)}
            >
              About
            </div>
          </div>
          {showAbout && (
            <div className="about-container">
              <h1>About this application</h1>
              <p>
                This is the display page for the unit-vis library. This library is a fork of{' '}
                <a href="https://github.com/intuinno/unit">Park etal's unit grammar</a> for specifying unit
                based charts through a declarative grammar. We make the core library available as reusable
                utility with a single entry point.{' '}
                <a href="https://www.microsoft.com/en-us/research/uploads/prod/2019/01/atom.pdf">
                  You can find the paper here
                </a>
                .
              </p>

              <p>
                You can download this library via npm through npm install unit-vis. The code is available on{' '}
                <a href="https://github.com/mcnuttandrew/unit-vis">github</a> if you are curious about how
                it's implement or if you wish to contribute to the library.
              </p>
            </div>
          )}
          {!showAbout && <Chart spec={parsedCode ?? undefined} />}
        </div>
      </div>
    </div>
  );
}
