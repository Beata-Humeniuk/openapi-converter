const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { detectVersion, detectExactVersion, convertSpec, canonicalOrder, OPENAPI_VERSIONS, LATEST_VERSION } = require('../src/convertCore');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

(async () => {
  const spec20 = JSON.parse(fs.readFileSync(path.join(__dirname, 'petstore-swagger2.json'), 'utf8'));

  assert(detectVersion(spec20) === '2.0', 'detects swagger 2.0');
  assert(detectVersion({ openapi: '3.0.3' }) === '3.0', 'detects openapi 3.0');
  assert(detectVersion({ openapi: '3.1.0' }) === '3.1', 'detects openapi 3.1');
  assert(detectVersion({ openapi: '3.2.0' }) === '3.2', 'detects openapi 3.2');
  assert(detectVersion({ foo: 1 }) === null, 'rejects non-spec input');
  assert(detectExactVersion({ openapi: '3.0.3' }) === '3.0.3', 'exact version detection');
  assert(LATEST_VERSION['3.0'] === OPENAPI_VERSIONS['3.0'][OPENAPI_VERSIONS['3.0'].length - 1] &&
    LATEST_VERSION['3.1'] === OPENAPI_VERSIONS['3.1'][OPENAPI_VERSIONS['3.1'].length - 1],
    'LATEST_VERSION matches the last entry of each published line');

  const { openapi: v30 } = await convertSpec(spec20, '3.0');
  assert(v30.openapi === '3.0.4', '2.0->3.0: family target stamps the latest 3.0.x patch');
  assert(v30.servers[0].url === 'https://petstore.example.com/v1', '2.0->3.0: servers from host+basePath');
  assert(v30.components.schemas.Pet.properties.tag.nullable === true, '2.0->3.0: x-nullable -> nullable');
  assert(v30.paths['/pets'].post.requestBody.content['application/json'].schema.$ref === '#/components/schemas/Pet',
    '2.0->3.0: body param -> requestBody, $ref rewritten');
  assert(v30.paths['/pets/{petId}/photo'].post.requestBody.content['multipart/form-data'].schema.properties.file.format === 'binary',
    '2.0->3.0: formData file -> multipart binary');
  assert(v30.components.securitySchemes.oauth.flows.authorizationCode.tokenUrl === 'https://auth.example.com/token',
    '2.0->3.0: oauth2 accessCode -> flows.authorizationCode');

  const { openapi: v31 } = await convertSpec(spec20, '3.1');
  assert(v31.openapi === '3.1.2', '2.0->3.1: family target stamps the latest 3.1.x patch');
  const tag31 = v31.components.schemas.Pet.properties.tag;
  assert(Array.isArray(tag31.type) && tag31.type.includes('null') && !('nullable' in tag31),
    '2.0->3.1: nullable -> type ["string","null"]');

  const spec30 = {
    openapi: '3.0.3',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas: { A: { type: 'integer', minimum: 0, exclusiveMinimum: true, nullable: true } } }
  };
  const { openapi: up31 } = await convertSpec(spec30, '3.1');
  const a = up31.components.schemas.A;
  assert(up31.openapi === '3.1.2', '3.0->3.1: version bumped to latest patch');
  assert(a.exclusiveMinimum === 0 && !('minimum' in a), '3.0->3.1: boolean exclusiveMinimum -> numberic');
  assert(Array.isArray(a.type) && a.type.includes('null'), '3.0->3.1: nullable -> type array');

  const spec30full = {
    openapi: '3.0.3',
    info: { title: 't', version: '1' },
    paths: { '/f': { post: {
      requestBody: { content: { 'application/json': {
        example: { keepMe: true },
        schema: { type: 'object', properties: {
          photo: { type: 'string', format: 'binary' },
          att: { type: 'string', format: 'byte' },
          note: { type: 'string', example: 'hello', nullable: true }
        } }
      } } },
      responses: { 200: { description: 'OK' } }
    } } },
    components: { schemas: {} }
  };
  const { openapi: up31full } = await convertSpec(spec30full, '3.1');
  const media = up31full.paths['/f'].post.requestBody.content['application/json'];
  const props = media.schema.properties;
  assert(media.example && media.example.keepMe === true, '3.0->3.1: Media Type example untouched');
  assert(!('format' in props.photo) && props.photo.contentMediaType === 'application/octet-stream',
    '3.0->3.1: format binary -> contentMediaType');
  assert(!('format' in props.att) && props.att.contentEncoding === 'base64',
    '3.0->3.1: format byte -> contentEncoding');
  assert(!('example' in props.note) && Array.isArray(props.note.examples) && props.note.examples[0] === 'hello',
    '3.0->3.1: schema example -> examples array');
  assert(!('nullable' in props.note) && Array.isArray(props.note.type) && props.note.type.includes('null'),
    '3.0->3.1: nested nullable -> type array');

  const spec31stale = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas: { S: { type: 'string', nullable: true, example: 'x' } } }
  };
  const { openapi: up32clean } = await convertSpec(spec31stale, '3.2');
  const sClean = up32clean.components.schemas.S;
  assert(up32clean.openapi === '3.2.0', '3.1->3.2: version stamped');
  assert(!('nullable' in sClean) && Array.isArray(sClean.type) && sClean.type.includes('null'),
    '3.1->3.2: leftover nullable cleaned to type array');
  assert(!('example' in sClean) && sClean.examples[0] === 'x', '3.1->3.2: example -> examples');

  const spec31 = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas: { B: { type: ['string', 'null'], exclusiveMaximum: 10 } } }
  };
  const { openapi: down30 } = await convertSpec(spec31, '3.0');
  const b = down30.components.schemas.B;
  assert(/^3\.0\./.test(down30.openapi), '3.1->3.0: version is 3.0.x');
  assert(b.type === 'string' && b.nullable === true, '3.1->3.0: type array -> nullable');
  assert(b.maximum === 10 && b.exclusiveMaximum === true,
    '3.1->3.0: numberic exclusiveMaximum -> maximum + boolean');

  const spec31drop = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas: { C: {
      type: 'object',
      patternProperties: { '^x-': { type: 'string' } },
      propertyNames: { pattern: '^[a-z]+$' },
      properties: { n: { type: 'number', exclusiveMinimum: 0 } }
    } } }
  };
  const { openapi: down30drop, warnings: wDrop } = await convertSpec(spec31drop, '3.0');
  const c = down30drop.components.schemas.C;
  assert(c.properties.n.minimum === 0 && c.properties.n.exclusiveMinimum === true,
    '3.1->3.0: numberic exclusiveMinimum -> minimum + boolean');
  assert(wDrop.some((w) => w.includes('patternProperties')) && wDrop.some((w) => w.includes('propertyNames')),
    '3.1->3.0: dropped 2020-12 keywords produce warnings');

  const { openapi: same } = await convertSpec(spec31, '3.1');
  assert(same === spec31, '3.1->3.1: passthrough');

  const { openapi: sameExact } = await convertSpec(spec31, '3.1.0');
  assert(sameExact === spec31, 'exact target equal to current version: passthrough');
  const { openapi: restamped } = await convertSpec(spec31, '3.1.2');
  assert(restamped.openapi === '3.1.2' && restamped.components === spec31.components,
    '3.1.0->3.1.2: only the version number changes, content untouched');
  assert(spec31.openapi === '3.1.0', 're-stamp does not mutate the input');
  const { openapi: v304 } = await convertSpec(spec20, '3.0.1');
  assert(v304.openapi === '3.0.1', '2.0->3.0.1: exact target lands verbatim in `openapi`');

  const { openapi: up32, warnings: w32 } = await convertSpec(spec31, '3.2');
  assert(up32.openapi === '3.2.0' && w32.length === 0, '3.1->3.2: version stamp only, no warnings');
  assert(up32.components.schemas.B.exclusiveMaximum === 10, '3.1->3.2: content carried over');

  const spec32 = {
    openapi: '3.2.0',
    $self: 'https://api.example.com/openapi.yaml',
    info: { title: 't', version: '1' },
    tags: [{ name: 'a', summary: 'S', kind: 'nav' }],
    paths: {
      '/x': {
        query: { responses: { '200': { description: 'OK' } } },
        additionalOperations: { COPY: { responses: { '200': { description: 'OK' } } } },
        get: { responses: { '200': { description: 'OK' } } }
      }
    }
  };
  const { openapi: same32 } = await convertSpec(spec32, '3.2');
  assert(same32 === spec32, '3.2->3.2: passthrough');
  const { openapi: down31, warnings: w321 } = await convertSpec(spec32, '3.1');
  assert(down31.openapi === '3.1.2', '3.2->3.1: version stamped');
  assert(!('$self' in down31) && !down31.paths['/x'].query && !down31.paths['/x'].additionalOperations,
    '3.2->3.1: 3.2-only constructs removed');
  assert(!('summary' in down31.tags[0]) && !('kind' in down31.tags[0]) && down31.tags[0].name === 'a',
    '3.2->3.1: 3.2-only tag fields removed, name kept');
  assert(down31.paths['/x'].get, '3.2->3.1: regular operations kept');
  assert(w321.some((w) => w.includes('$self')) && w321.some((w) => w.includes('query')) &&
    w321.some((w) => w.includes('additionalOperations')) && w321.some((w) => w.includes('summary')),
    '3.2->3.1: every removal reported; got: ' + JSON.stringify(w321));
  assert(spec32.paths['/x'].query, '3.2->3.1: input untouched');

  const { openapi: down32to20, warnings: w3220 } = await convertSpec(spec32, '2.0');
  assert(down32to20.swagger === '2.0', '3.2->2.0: chained downgrade works');
  assert(w3220.some((w) => w.includes('query')), '3.2->2.0: warnings from the 3.2 step preserved');

  const { openapi: back20, warnings: w1 } = await convertSpec(v30, '2.0');
  assert(back20.swagger === '2.0', '3.0->2.0: version is swagger 2.0');
  assert(back20.host === 'petstore.example.com' && back20.basePath === '/v1' && back20.schemes[0] === 'https',
    '3.0->2.0: servers -> host/basePath/schemes');
  assert(back20.definitions.Pet.properties.name.type === 'string', '3.0->2.0: components/schemas -> definitions');
  assert(back20.definitions.Pet.properties.tag['x-nullable'] === true, '3.0->2.0: nullable -> x-nullable');
  const backPost = back20.paths['/pets'].post;
  const bodyParam = backPost.parameters.find((p) => p.in === 'body');
  assert(bodyParam && bodyParam.schema.$ref === '#/definitions/Pet', '3.0->2.0: requestBody -> body param, $ref rewritten');
  assert(backPost.consumes.includes('application/json'), '3.0->2.0: content types -> consumes');
  const backGet = back20.paths['/pets'].get;
  assert(backGet.parameters[1].type === 'array' && backGet.parameters[1].collectionFormat === 'csv',
    '3.0->2.0: array query param -> collectionFormat csv');
  assert(backGet.responses['200'].schema.items.$ref === '#/definitions/Pet', '3.0->2.0: response content -> schema');
  assert(backGet.responses['200'].headers['X-Rate-Limit'].type === 'integer', '3.0->2.0: response header flattened');
  const backUpload = back20.paths['/pets/{petId}/photo'].post;
  const fileParam = backUpload.parameters.find((p) => p.in === 'formData');
  assert(fileParam && fileParam.type === 'file', '3.0->2.0: multipart binary -> formData type file');
  assert(back20.securityDefinitions.oauth.flow === 'accessCode' && back20.securityDefinitions.oauth.tokenUrl,
    '3.0->2.0: oauth2 authorizationCode -> flow accessCode');
  assert(back20.securityDefinitions.api_key.type === 'apiKey', '3.0->2.0: apiKey preserved');

  const lossy31 = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    servers: [{ url: 'https://a.example.com' }, { url: 'https://b.example.com' }],
    paths: {
      '/x': {
        get: {
          responses: { '200': { description: 'OK', content: { 'application/json': { schema: { oneOf: [{ type: 'string' }, { type: 'integer' }] } } } } }
        }
      }
    },
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } }
  };
  const { openapi: down20, warnings: w2 } = await convertSpec(lossy31, '2.0');
  assert(down20.swagger === '2.0', '3.1->2.0: chained downgrade works');
  assert(down20.host === 'a.example.com', '3.1->2.0: first server used');
  assert(down20.paths['/x'].get.responses['200'].schema.type === 'string', '3.1->2.0: oneOf -> first variant');
  assert(down20.securityDefinitions.bearer.type === 'apiKey' && down20.securityDefinitions.bearer.name === 'Authorization',
    '3.1->2.0: http bearer approximated as apiKey Authorization');
  assert(w2.some((w) => w.includes('oneOf')) && w2.some((w) => w.includes('server')) && w2.some((w) => w.includes('bearer')),
    '3.1->2.0: warnings reported for oneOf, servers, bearer; got: ' + JSON.stringify(w2));

  const { openapi: same20, warnings: w3 } = await convertSpec(spec20, '2.0');
  assert(same20 === spec20 && w3.length === 0, '2.0->2.0: passthrough, no warnings');

  const bare20 = {
    swagger: '2.0',
    info: { title: 't', version: '1' },
    paths: { '/y': { get: { responses: { '200': { description: 'OK', schema: { type: 'string' } } } } } }
  };
  const { openapi: bare20out } = await convertSpec(bare20, '2.0');
  assert(bare20out.paths['/y'].get.produces[0] === 'application/json',
    '2.0 without produces: default application/json AT the endpoint');
  assert(!bare20out.produces && !bare20out.consumes, 'no global consumes/produces in the output');
  assert(!bare20out.paths['/y'].get.consumes, 'GET without body: no consumes');
  assert(!bare20.paths['/y'].get.produces, 'original input object untouched');
  const { openapi: bare30 } = await convertSpec(bare20, '3.0');
  assert(bare30.paths['/y'].get.responses['200'].content['application/json'],
    '2.0 without produces -> 3.0: response content under application/json (not */*)');
  const { openapi: pet20again } = await convertSpec(spec20, '2.0');
  assert(pet20again === spec20, '2.0 with global consumes/produces set: untouched (passthrough)');
  assert(down20.paths['/x'].get.produces[0] === 'application/json',
    '3.1->2.0: produces derived from content at the endpoint');
  assert(!down20.produces && !down20.consumes, '3.1->2.0: no global consumes/produces');
  assert(backGet.produces[0] === 'application/json', 'roundtrip: produces at the endpoint after returning to 2.0');

  const ordered = canonicalOrder({ paths: {}, definitions: {}, swagger: '2.0', info: {}, host: 'x' });
  assert(Object.keys(ordered).join(',') === 'swagger,info,host,paths,definitions',
    'canonicalOrder: metadata before paths/definitions; got ' + Object.keys(ordered).join(','));

  const asYaml = yaml.dump(v31, { noRefs: true, lineWidth: -1 });
  const asJson = JSON.stringify(v31, null, 2);
  assert(yaml.load(asYaml).openapi === v31.openapi, 'YAML output parses back');
  assert(JSON.parse(asJson).openapi === v31.openapi, 'JSON output parses back');

  const woSpec = {
    openapi: '3.0.0',
    info: { title: 'wo', version: '1' },
    paths: {
      '/w': {
        post: {
          requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/W' } } } },
          responses: { '200': { description: 'OK' } }
        }
      }
    },
    components: {
      schemas: {
        W: {
          type: 'object',
          properties: {
            secret: { type: 'string', writeOnly: true, description: 'Secret to be set.' },
            noDescription: { type: 'string', writeOnly: true }
          }
        }
      }
    }
  };
  const { openapi: woDown, warnings: woWarnings } = await convertSpec(woSpec, '2.0');
  const woProps = woDown.definitions.W.properties;
  assert(woProps.secret.writeOnly === undefined, '3.0->2.0: writeOnly removed (2.0 does not know it)');
  assert(woProps.secret.description === 'Secret to be set.\n[writeOnly]', 'writeOnly appended as a tag under the existing description');
  assert(woProps.noDescription.description === '[writeOnly]', 'writeOnly as a tag also when there was no description before');
  assert(woWarnings.some((w) => w.includes('kept as a [writeOnly] tag')), 'the warning speaks of keeping, not of losing');
  const woLift = require('../src/exampleFill').liftDescriptionTags(woDown);
  assert(woProps.secret.writeOnly === undefined && woProps.noDescription.writeOnly === undefined,
    'Apply Markers on the 2.0 file does not write writeOnly — 2.0 has no such field');
  assert(woProps.secret.description === 'Secret to be set.\n[writeOnly]' && woProps.noDescription.description === '[writeOnly]',
    'the tag stays in the description, ready for a conversion back up');
  assert(woLift.notApplied.some((n) => /writeOnly/.test(n.reason)), 'and the reason is reported');

  const { openapi: woUp } = await convertSpec(JSON.parse(JSON.stringify(woDown)), '3.0.3');
  const woUpLift = require('../src/exampleFill').liftDescriptionTags(woUp);
  const woUpProps = woUp.components.schemas.W.properties;
  assert(woUpProps.secret.writeOnly === true && woUpProps.noDescription.writeOnly === true,
    '2.0 -> 3.0: the [writeOnly] tag becomes the field again — the round trip is closed');
  assert(woUpProps.secret.description === 'Secret to be set.' && woUpProps.noDescription.description === undefined,
    'and the tag is stripped from the description once it has been applied');
  assert(woUpLift.tagFields === 2, 'counter: both fields recovered on the way up');

  console.log('PASS: all assertions ok (all routes incl. ->2.0, round-trips)');
})().catch(e => { console.error('FAIL (exception): ' + (e.stack || e)); process.exit(1); });
