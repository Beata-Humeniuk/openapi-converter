const { applyMarkers, liftDescriptionTags } = require('../src/exampleFill');
const { convertSpec } = require('../src/convertCore');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
const clone = (o) => JSON.parse(JSON.stringify(o));

const source20 = () => ({
  swagger: '2.0', info: { title: 'T', version: '1' }, produces: ['application/json'],
  paths: { '/o': { post: { operationId: 'c',
    description: 'Op.\n[response: 404 "Not found" #E]\n[response: 4XX "Client error" #E]\n' +
      '[responseCase: [code: 404] [name: caseA] [summary: Case A] [exampleBody: {"code": "X"}]]',
    responses: { '200': { description: 'OK' } } } } },
  definitions: {
    E: { type: 'object', properties: { code: { type: 'string' } } },
    P: { type: 'object', properties: { a: { type: 'string', description: 'Field. [example: "X"] [nullable]' } } }
  }
});

const codes = (spec) => Object.keys(spec.paths['/o'].post.responses).join(',');
const desc = (spec) => spec.paths['/o'].post.description || '';
const field = (spec) => (spec.definitions || spec.components.schemas).P.properties.a;

(async () => {
  let { openapi } = await convertSpec(clone(source20()), '3.1.0');
  let stats = liftDescriptionTags(openapi);
  assert(codes(openapi) === '200,404,4XX', '1: upgrade applies both the portable code and the 3.x-only range');
  assert(openapi.paths['/o'].post.responses['404'].content['application/json'].examples.caseA !== undefined,
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
  assert(openapi.paths['/o'].post.responses['404'].content['application/json'].examples.caseA !== undefined,
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
      description: 'Op.\n[response: 404 "Not found" #E]\n[response: 4XX "ErrorBody"]\n' +
        '[responseCase: [code: 404] [name: a] [summary: Case] [exampleBody: {"code": "X"}]]',
      responses: { '200': { description: 'OK' } } } } },
    components: { schemas: {
      E: { type: 'object', properties: { code: { type: 'string' } } },
      P: { type: 'object', properties: { a: { type: 'string', description: 'Field. [example: "X"] [nullable]' } } }
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

  const refSiblings = {
    swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
    definitions: {
      Holder: { type: 'object', properties: {
        viaRef:   { $ref: '#/definitions/Code', description: 'Shared type. [example: "AB"]' },
        inItems:  { type: 'array', items: { $ref: '#/definitions/Code', description: 'Shared element. [example: ["AB", "CD"]]' } },
        untouched: { $ref: '#/definitions/Code', description: 'A plain note with no marker.' }
      } },
      Code: { type: 'string' }
    }
  };
  ({ openapi } = await convertSpec(refSiblings, '3.0.3'));
  liftDescriptionTags(openapi);
  const H = openapi.components.schemas.Holder.properties;
  assert(H.viaRef.example === 'AB',
    '5: a marker written next to $ref survives the conversion — 3.0 ignores $ref siblings, so it is wrapped in allOf first');
  assert(JSON.stringify(H.viaRef.allOf) === '[{"$ref":"#/components/schemas/Code"}]', '5: the reference itself is kept');
  assert(JSON.stringify(H.inItems.example) === '["AB","CD"]', '5: the same on the element of a list');
  assert(openapi.components.schemas.Code.example === undefined, '5: the shared type stays untouched');
  assert(H.untouched.$ref === '#/components/schemas/Code' && H.untouched.allOf === undefined,
    '5: a description with no marker is not worth restructuring the field for');
  assert(refSiblings.definitions.Holder.properties.viaRef.$ref === '#/definitions/Code' &&
    refSiblings.definitions.Holder.properties.viaRef.allOf === undefined,
    '5: the file the conversion read from is left exactly as it was');

  console.log('convert-markers-test OK (5 scenarios)');
})();
