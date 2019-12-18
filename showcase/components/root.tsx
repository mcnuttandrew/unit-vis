import React, {useState} from 'react';
import Chart from './chart';
import DefaultChooser from './default-chooser';
import CodeEditor from './codeEditor';
import {UnitSpec} from '../../index.d';

export default function Root() {
  const [code, changeSpec] = useState('{}');
  const [inError, setError] = useState(false);

  return (
    <div>
      <h1>Unit Vis test</h1>
      <div style={{display: 'flex'}}>
        <div style={{display: 'flex', flexDirection: 'column'}}>
          <DefaultChooser setCode={changeSpec} />
          <CodeEditor
            setNewCode={({code, inError}) => {
              changeSpec(code);
              setError(inError);
            }}
            code={code}
          />
        </div>
        <Chart spec={!inError ? (JSON.parse(code) as UnitSpec) : null} />
      </div>
    </div>
  );
}
