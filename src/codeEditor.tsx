import React from 'react';
import MonacoEditor from 'react-monaco-editor';

interface Props {
  setNewCode: ({code, inError}: {code: string; inError: boolean}) => void;
  code: string;
}

export default class CodeEditor extends React.Component<Props> {
  constructor(props: any) {
    super(props);
    this.editorDidMount = this.editorDidMount.bind(this);
    this.handleCodeUpdate = this.handleCodeUpdate.bind(this);
  }
  editorDidMount(editor: any) {
    editor.focus();
    // @ts-ignore
    import('monaco-themes/themes/Cobalt.json').then(data => {
      // @ts-ignore
      monaco.editor.defineTheme('cobalt', data);
      // @ts-ignore
      monaco.editor.setTheme('cobalt');
    });
  }

  handleCodeUpdate(code: string) {
    const {setNewCode} = this.props;

    Promise.resolve()
      .then(() => JSON.parse(code))
      .then(() => setNewCode({code, inError: false}))
      .catch(() => setNewCode({code, inError: true}));
  }

  render() {
    const {code} = this.props;

    return (
      <div className="editor">
        <MonacoEditor
          ref="monaco"
          language="json"
          theme="monokai"
          value={code}
          options={{
            selectOnLineNumbers: true,
            automaticLayout: true,
            wordWrap: 'on',
            minimap: {
              enabled: false,
            },
            fontSize: 15,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
          }}
          onChange={this.handleCodeUpdate}
          editorDidMount={this.editorDidMount}
        />
      </div>
    );
  }
}
