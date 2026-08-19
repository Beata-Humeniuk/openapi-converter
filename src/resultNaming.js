const path = require('path');

function resultName(sourcePath, isYaml) {
  const base = sourcePath
    ? path.basename(sourcePath).replace(/\.(json|yaml|yml|md)$/i, '')
    : 'openapi';
  return base + '.' + (isYaml ? 'yaml' : 'json');
}

function samePath(a, b) {
  if (!a || !b) return false;
  const one = path.resolve(a);
  const two = path.resolve(b);
  return process.platform === 'win32' ? one.toLowerCase() === two.toLowerCase() : one === two;
}

function resultPath(sourcePath, directory, isYaml) {
  if (!directory) return null;
  const name = resultName(sourcePath, isYaml);
  const target = path.join(directory, name);
  if (!samePath(target, sourcePath)) return target;
  return path.join(directory, name.replace(/\.([^.]+)$/, '.converted.$1'));
}

module.exports = { resultName, resultPath, samePath };
