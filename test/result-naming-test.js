const path = require('path');
const { resultName, resultPath, samePath } = require('../src/resultNaming');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const dir = path.join(path.sep + 'contracts', 'retail');
const at = (name) => path.join(dir, name);

assert(resultName(at('StationReadings.json'), true) === 'StationReadings.yaml',
  'the result keeps the source name and takes the target extension');
assert(resultName(at('StationReadings.yaml'), false) === 'StationReadings.json', 'the other way round');
assert(resultName(at('contract.yml'), true) === 'contract.yaml',
  'a .yml source still produces .yaml, so Ctrl+S does not propose .yml');
assert(resultName(null, true) === 'openapi.yaml', 'an unsaved source falls back to a neutral name');

assert(resultPath(at('StationReadings.json'), dir, true) === at('StationReadings.yaml'),
  'the result is placed next to the source, with the full path');
assert(path.isAbsolute(resultPath(at('StationReadings.json'), dir, true)),
  'the path is absolute — a bare name would be resolved against the drive root, where writing is not permitted');

assert(resultPath(at('StationReadings.yaml'), dir, true) === at('StationReadings.converted.yaml'),
  'converting YAML to YAML does not point at the source file, which saving would overwrite');
assert(resultPath(at('StationReadings.yaml'), dir, false) === at('StationReadings.json'),
  'a different extension cannot collide, so the plain name stays');

assert(resultPath(null, dir, true) === at('openapi.yaml'), 'an unsaved source lands in the given directory');
assert(resultPath(at('x.json'), null, true) === null,
  'with no directory known there is no path to associate — the caller opens a plain untitled document instead');

assert(samePath(at('a.yaml'), at('a.yaml')), 'the same path is recognised');
assert(!samePath(at('a.yaml'), at('b.yaml')), 'different files are not');
assert(!samePath(null, at('a.yaml')), 'a missing path matches nothing');

console.log('result-naming-test OK');
