const fs = require('fs');
const path = require('path');
const { applyMarkers } = require('../src/exampleFill');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const inputPath = path.join(__dirname, 'markers-swagger2.input.json');
const expectedPath = path.join(__dirname, 'markers-swagger2.expected.json');

const source = fs.readFileSync(inputPath, 'utf8');
assert(/\[example:/.test(source) && /\[pattern:/.test(source),
  'the fixture lost its description markers — someone saved it after running the command');

const demoPath = path.join(__dirname, '..', 'examples', 'markers-swagger2.json');
if (fs.existsSync(demoPath)) {
  const demo = fs.readFileSync(demoPath, 'utf8');
  assert(demo === source || !/\[example:/.test(demo),
    'examples/markers-swagger2.json drifted from the fixture — run `npm run demo:reset`');
}

const spec = JSON.parse(source);
const stats = applyMarkers(spec);
const result = { spec: spec, mismatched: stats.mismatched };

if (process.env.UPDATE === '1') {
  fs.writeFileSync(expectedPath, JSON.stringify(result, null, 2) + '\n');
  console.log('markers-golden-test: rewrote ' + path.basename(expectedPath));
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

function diff(a, b, at, out) {
  if (out.length >= 12) return out;
  const isObj = (v) => v && typeof v === 'object';
  if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(at + ': got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b));
    return out;
  }
  for (const key of new Set(Object.keys(a).concat(Object.keys(b)))) {
    diff(a[key], b[key], at + '.' + key, out);
  }
  return out;
}

const differences = diff(result, expected, '', []);
if (differences.length) {
  console.error('FAIL: the result on the demo file differs from the expected one:');
  for (const d of differences) console.error('  ' + d);
  console.error('  (intended change? UPDATE=1 node test/markers-golden-test.js)');
  process.exit(1);
}

const snapshot = JSON.stringify(spec);
applyMarkers(spec);
assert(JSON.stringify(spec) === snapshot, 'a second pass on the demo file changed something');

console.log('markers-golden-test OK (' + Object.keys(spec.definitions.Agreement.properties).length + ' contract fields)');
