import React, {useState} from 'react';
import Chart from './chart';
import DefaultChooser from './default-chooser';
import CodeEditor from './codeEditor';
import {Spec} from '../../index.d';
import {classnames} from '../utils';

export default function Root() {
  const [code, changeSpec] = useState('{}');
  const [inError, setError] = useState(false);
  const [showAbout, setAbout] = useState(false);
  let parsedCode = null;
  try {
    parsedCode = JSON.parse(code) as Spec;
  } catch {
    parsedCode = null;
  }

  return (
    <div className="appbody">
      <div className="header">
        <h1>Unit Vis</h1>
      </div>
      <div className="flex main-content">
        <div className="flex-down left-column">
          {inError && <div className="error-bar">ERROR</div>}
          <DefaultChooser setCode={changeSpec} />
          <CodeEditor
            setNewCode={({code, inError}) => {
              setError(inError);
              changeSpec(code);
            }}
            code={code}
          />
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
          {!showAbout && <Chart spec={parsedCode} />}
        </div>
      </div>
    </div>
  );
}
