import React, {useState} from 'react';
import Chart from './chart';
import DefaultChooser from './default-chooser';
import CodeEditor from './codeEditor';
import {Spec} from '../../index.d';

export default function Root() {
  const [code, changeSpec] = useState('{}');
  const [inError, setError] = useState(false);

  return (
    <div className="appbody">
      <div className="header">
        <h1>Unit Vis</h1>
      </div>
      <div className="flex main-content">
        <div className="flex-down">
          <DefaultChooser setCode={changeSpec} />
          <CodeEditor
            setNewCode={({code, inError}) => {
              changeSpec(code);
              setError(inError);
            }}
            code={code}
          />
        </div>
        <Chart spec={!inError ? (JSON.parse(code) as Spec) : null} />
      </div>
    </div>
  );
}
