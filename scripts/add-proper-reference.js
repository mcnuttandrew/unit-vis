const {getFile, writeFile} = require('hoopoe');

getFile('./showcase/assets/unit-vis-schema.json')
  .then(d => JSON.parse(d))
  .then(d => {
    d.$ref = '#/definitions/Spec';
    writeFile(
      './showcase/assets/unit-vis-schema.json',
      JSON.stringify(d, null, 2),
    );
  });
