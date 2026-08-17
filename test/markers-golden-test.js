// End-to-end test: the demo file examples/markers-swagger2.json goes through
// applyMarkers and must come out EXACTLY as recorded in
// markers-swagger2.expected.json. The unit tests next door check the rules
// one by one; this one guards them all at once, on a real contract — it
// catches both a behavior change and a drift between the code, the demo file
// and the README (the demo is a fixture here, not an illustration on the side).
//
// When a behavior change is intended: UPDATE=1 node test/markers-golden-test.js
// rewrites the expected file — and then the difference shows up in a
// reviewable diff.

const fs = require('fs');
const path = require('path');
const { applyMarkers } = require('../src/exampleFill');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

// The fixture lives in test/, not in examples/: the copy in examples/ is for
// clicking around in the editor and loses its markers once saved, while the
// test must keep working.
const inputPath = path.join(__dirname, 'markers-swagger2.input.json');
const expectedPath = path.join(__dirname, 'markers-swagger2.expected.json');

const source = fs.readFileSync(inputPath, 'utf8');
assert(/\[example:/.test(source) && /\[pattern:/.test(source),
  'the fixture lost its description markers — someone saved it after running the command');

// The clickable copy in the editor sometimes gets saved after running the
// command (losing its markers) and then simply needs restoring. But a copy
// whose marker CONTENT differs means someone edited one of the two — the demo
// then shows something different from what the test guards.
const demoPath = path.join(__dirname, '..', 'examples', 'markers-swagger2.json');
if (fs.existsSync(demoPath)) {
  const demo = fs.readFileSync(demoPath, 'utf8');
  assert(demo === source || !/\[example:/.test(demo),
    'examples/markers-swagger2.json drifted from the fixture — run `npm run demo:reset`');
}

const spec = JSON.parse(source);
const stats = applyMarkers(spec);
const result = { spec: spec, skipped: stats.skipped, mismatched: stats.mismatched };

if (process.env.UPDATE === '1') {
  fs.writeFileSync(expectedPath, JSON.stringify(result, null, 2) + '\n');
  console.log('markers-golden-test: rewrote ' + path.basename(expectedPath));
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));

// A difference is shown as the path to the field, not as a dump of the file.
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

// Idempotence on a real contract: a second pass touches nothing.
const snapshot = JSON.stringify(spec);
applyMarkers(spec);
assert(JSON.stringify(spec) === snapshot, 'a second pass on the demo file changed something');

console.log('markers-golden-test OK (' + Object.keys(spec.definitions.Station.properties).length + ' contract fields)');
