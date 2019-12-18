const {executeCommandLineCmd, getFile, writeFile} = require('hoopoe');

executeCommandLineCmd('ls -a showcase/data').then(({stdout}) => {
  const fileNames = stdout.split('\n').filter(name => {
    return (
      name !== '.' && name !== '..' && name !== '' && !name.includes('.csv')
    );
  });
  fileNames.forEach(fileName => {
    getFile(`./showcase/data/${fileName}`)
      .then(d => JSON.parse(d))
      .then(d => {
        delete d.$ref;
        d.$schema = 'https://unit-vis.netlify.com/assets/unit-vis-schema.json';
        writeFile(`./showcase/data/${fileName}`, JSON.stringify(d, null, 2));
      });
  });
});
