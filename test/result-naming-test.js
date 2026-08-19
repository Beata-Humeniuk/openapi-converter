const path = require('path');
const { resultName, resultPath, samePath } = require('../src/resultNaming');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const dir = path.join(path.sep + 'contracts', 'retail');
const at = (name) => path.join(dir, name);

assert(resultName(at('RetailAccountSales.json'), true) === 'RetailAccountSales.yaml',
  'the result keeps the source name and takes the target extension');
assert(resultName(at('RetailAccountSales.yaml'), false) === 'RetailAccountSales.json', 'the other way round');
assert(resultName(at('contract.yml'), true) === 'contract.yaml',
  'a .yml source still produces .yaml, so Ctrl+S does not propose .yml');
assert(resultName(null, true) === 'openapi.yaml', 'an unsaved source falls back to a neutral name');

assert(resultPath(at('RetailAccountSales.json'), dir, true) === at('RetailAccountSales.yaml'),
  'the result is placed next to the source, with the full path');
assert(path.isAbsolute(resultPath(at('RetailAccountSales.json'), dir, true)),
  'the path is absolute — a bare name would be resolved against the drive root, where writing is not permitted');

assert(resultPath(at('RetailAccountSales.yaml'), dir, true) === at('RetailAccountSales.converted.yaml'),
  'converting YAML to YAML does not point at the source file, which saving would overwrite');
assert(resultPath(at('RetailAccountSales.yaml'), dir, false) === at('RetailAccountSales.json'),
  'a different extension cannot collide, so the plain name stays');

assert(resultPath(null, dir, true) === at('openapi.yaml'), 'an unsaved source lands in the given directory');
assert(resultPath(at('x.json'), null, true) === null,
  'with no directory known there is no path to associate — the caller opens a plain untitled document instead');

assert(samePath(at('a.yaml'), at('a.yaml')), 'the same path is recognised');
assert(!samePath(at('a.yaml'), at('b.yaml')), 'different files are not');
assert(!samePath(null, at('a.yaml')), 'a missing path matches nothing');

console.log('result-naming-test OK');
