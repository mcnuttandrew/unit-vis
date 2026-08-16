const {getFile, writeFile} = require('fs/promises');
var exec = require('child_process').exec;
/**
 * Execute a bash command
 * @param cmd - command to execute
 */
function executeCommandLineCmd(cmd) {
  return new Promise(function(resolve, reject) {
    exec(cmd, function(err, stdout, stderr) {
      if (err) {
        reject(err);
      } else {
        resolve({stdout: stdout, stderr: stderr});
      }
    });
  });
}

executeCommandLineCmd('ls -a showcase/data').then(({stdout}) => {
  const fileNames = stdout.split('\n').filter(name => {
    return name !== '.' && name !== '..' && name !== '' && !name.includes('.csv');
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
