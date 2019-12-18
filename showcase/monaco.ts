// Cribbed from vega-editor
import stringify from 'json-stringify-pretty-compact';
import * as Monaco from 'monaco-editor/esm/vs/editor/editor.api';

/**
 * Adds markdownDescription props to a schema. See https://github.com/Microsoft/monaco-editor/issues/885
 */
function addMarkdownProps(value: any) {
  if (typeof value === 'object' && value !== null) {
    if (value.description) {
      value.markdownDescription = value.description;
    }

    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        value[key] = addMarkdownProps(value[key]);
      }
    }
  }
  return value;
}

// // @ts-ignore
const unitVisSchema = require('./assets/unit-vis-schema.json');
addMarkdownProps(unitVisSchema);

export default function setupMonaco() {
  Monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    allowComments: false,
    enableSchemaRequest: true,
    schemas: [
      {
        uri: 'https://unit-vis.netlify.com/assets/unit-vis-schema.json', // id of the first schema
        fileMatch: ['*'], // associate with our model
        schema: unitVisSchema,
      },
    ],
    validate: true,
  });

  Monaco.languages.json.jsonDefaults.setModeConfiguration({
    documentFormattingEdits: false,
    documentRangeFormattingEdits: false,
    completionItems: true,
    hovers: true,
    documentSymbols: true,
    tokens: true,
    colors: true,
    foldingRanges: true,
    diagnostics: true,
  });

  Monaco.languages.registerDocumentFormattingEditProvider('json', {
    provideDocumentFormattingEdits(
      model: Monaco.editor.ITextModel,
      options: Monaco.languages.FormattingOptions,
      token: Monaco.CancellationToken,
    ): Monaco.languages.TextEdit[] {
      return [
        {
          range: model.getFullModelRange(),
          text: stringify(JSON.parse(model.getValue())),
        },
      ];
    },
  });
}
