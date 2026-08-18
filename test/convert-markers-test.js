const { applyMarkers, liftDescriptionTags } = require('../src/exampleFill');
const { convertSpec } = require('../src/convertCore');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
const clone = (o) => JSON.parse(JSON.stringify(o));

const source20 = () => ({
  swagger: '2.0', info: { title: 'T', version: '1' }, produces: ['application/json'],
  paths: { '/o': { post: { operationId: 'c',
    description: 'Op.\n[response: 404 "Nie znaleziono" #E]\n[response: 4XX "Blad klienta" #E]\n' +
      '[responseCase: 404 przypadekA "Case A" {"code": "X"}]',
    responses: { '200': { description: 'OK' } } } } },
  definitions: {
    E: { type: 'object', properties: { code: { type: 'string' } } },
    P: { type: 'object', properties: { a: { type: 'string', description: 'Pole. [example: "X"] [nullable]' } } }
  }
});

const codes = (spec) => Object.keys(spec.paths['/o'].post.responses).join(',');
const desc = (spec) => spec.paths['/o'].post.description || '';
const field = (spec) => (spec.definitions || spec.components.schemas).P.properties.a;

(async () => {
  let { openapi } = await convertSpec(clone(source20()), '3.1.0');
  let stats = liftDescriptionTags(openapi);
  assert(codes(openapi) === '200,404,4XX', '1: upgrade applies both the portable code and the 3.x-only range');
  assert(openapi.paths['/o'].post.responses['404'].content['application/json'].examples.przypadekA !== undefined,
    '1: upgrade applies the 3.x-only named case');
  assert(desc(openapi) === 'Op.', '1: nothing is left in the description');
  assert(stats.notApplied.length === 0, '1: nothing is reported as unapplied');
  assert(JSON.stringify(field(openapi).type) === '["string","null"]' &&
    field(openapi).nullable === undefined && field(openapi)['x-nullable'] === undefined,
    '1: field markers use the TARGET semantics — 3.1 states null in the type, it has no nullable keyword');

  const stepOne = source20();
  const stats2a = applyMarkers(stepOne);
  assert(codes(stepOne) === '200,404', '2: on 2.0 only the portable marker is applied');
  assert(stats2a.notApplied.length === 2, '2: the two 3.x-only markers are reported on 2.0');
  assert(/\[response: 4XX/.test(desc(stepOne)) && /\[responseCase:/.test(desc(stepOne)),
    '2: they stay visible in the 2.0 description');

  ({ openapi } = await convertSpec(clone(stepOne), '3.1.0'));
  const stats2b = liftDescriptionTags(openapi);
  assert(codes(openapi) === '200,404,4XX', '2: converting later applies what was left over');
  assert(openapi.paths['/o'].post.responses['404'].content['application/json'].examples.przypadekA !== undefined,
    '2: the leftover case is applied during the conversion');
  assert(desc(openapi) === 'Op.', '2: no second Apply Markers run is needed afterwards');
  assert(stats2b.notApplied.length === 0, '2: nothing is left over');

  ({ openapi } = await convertSpec(clone(source20()), '2.0'));
  const stats3 = liftDescriptionTags(openapi);
  assert(codes(openapi) === '200,404', '3: a target without support applies only what it can');
  assert(/\[response: 4XX/.test(desc(openapi)) && /\[responseCase:/.test(desc(openapi)),
    '3: unsupported markers stay in the description');
  assert(stats3.notApplied.length === 2, '3: and are reported with a reason');

  const source30 = {
    openapi: '3.0.3', info: { title: 'T', version: '1' },
    paths: { '/o': { post: { operationId: 'c',
      description: 'Op.\n[response: 404 "Nie znaleziono" #E]\n[response: 4XX "Blad"]\n' +
        '[responseCase: 404 a "Case" {"code": "X"}]',
      responses: { '200': { description: 'OK' } } } } },
    components: { schemas: {
      E: { type: 'object', properties: { code: { type: 'string' } } },
      P: { type: 'object', properties: { a: { type: 'string', description: 'Pole. [example: "X"] [nullable]' } } }
    } }
  };
  ({ openapi } = await convertSpec(clone(source30), '2.0'));
  const stats4 = liftDescriptionTags(openapi);
  assert(codes(openapi) === '200,404', '4: the downgrade applies only what 2.0 supports');
  assert(/\[response: 4XX/.test(desc(openapi)) && /\[responseCase:/.test(desc(openapi)),
    '4: markers the older version lost stay in the description');
  assert(stats4.notApplied.length === 2, '4: and are reported');
  assert(field(openapi)['x-nullable'] === true && field(openapi).nullable === undefined,
    '4: field markers follow the TARGET semantics — x-nullable in 2.0');

  console.log('convert-markers-test OK (4 scenarios)');
})();
