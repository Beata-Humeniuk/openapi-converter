const {
  applyMarkers, liftDescriptionTags,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
} = require('../src/exampleFill');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const s1 = scanTags('Ticket number. [example: TK/2026/000123]');
assert(s1.length === 1 && s1[0].key === 'example' && s1[0].raw === 'TK/2026/000123', 'tag with a value is read');
const s2 = scanTags('Field. [deprecated] [format: uuid]');
assert(s2.length === 2 && s2[0].raw === undefined && s2[1].raw === 'uuid', 'valueless flag + tag with a value');
assert(scanTags('[example: {"a": [1, 2]}]')[0].raw === '{"a": [1, 2]}', 'balanced brackets in JSON');
assert(scanTags('[example: unclosed').length === 0, 'unclosed tag is ignored');
assert(scanTags('cardinality [0..1] in the description').length === 0, 'non-tag brackets ([0..1]) do not match');
assert(exampleTagValue({ type: 'string', description: '[example: 0012]' }) === '0012', 'a string stays a string');
assert(exampleTagValue({ type: 'integer', description: '[EXAMPLE: 42]' }) === 42, 'integer + case does not matter');
assert(exampleTagValue({ type: 'boolean', description: '[example: true]' }) === true, 'boolean: true');
assert(exampleTagValue({ type: 'boolean', description: '[example: FALSE]' }) === false, 'boolean: case does not matter');
assert(exampleTagValue({ type: 'boolean', description: '[example: yes]' }) === undefined,
  'on a boolean field only true/false match — not yes/no words from any language');
assert(exampleTagValue({ type: 'boolean', description: '[example: 1]' }) === undefined, 'a number is not a boolean value');
assert(exampleTagValue({ type: 'number', description: '[example: 0.5]' }) === 0.5, 'number with a decimal point');
assert(exampleTagValue({ type: 'number', description: '[example: 0,5]' }) === undefined,
  'a decimal comma is not valid file notation — the marker stays in the description');
assert(exampleTagValue({ type: 'string', description: '[exmaple: X]' }) === undefined, 'a typo is NOT matched');
assert(exampleTagValue({ type: 'string', description: 'example: X without brackets' }) === undefined, 'without brackets it does not match');
assert(defaultTagValue({ type: 'string', description: '[default: hPa]' }) === 'hPa', 'default tag');
assert(coerceValue('"007"', 'string') === '007', 'quotes are stripped for string');
assert(stripDescriptionTags('text [example: X] and more') === 'text and more', 'strip keeps the rest of the description');
assert(stripDescriptionTags('text [TODO: check] the rest') === 'text [TODO: check] the rest', 'strip leaves unknown tags alone');

const uniSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: {
    schemas: {
      Field: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: 'Product code. [format: uuid] [minLength: 3] [maxLength: 36] [deprecated] [TODO: to review]'
          },
          kind: { type: 'string', description: '[enum: A, B, C]' },
          counter: { type: 'integer', description: '[minimum: 10] [multipleOf: 5]' },
          legacy: { type: 'string', description: '[nullable] [readOnly] [x-team: CORE]' },
          bad: { type: 'string', description: '[minLength: abc]' }
        }
      }
    }
  }
};
liftDescriptionTags(uniSpec);
const U = uniSpec.components.schemas.Field.properties;
assert(U.code.format === 'uuid' && U.code.minLength === 3 && U.code.maxLength === 36, 'format/minLength/maxLength from tags');
assert(U.code.deprecated === true, 'valueless [deprecated] flag');
assert(U.code.description === 'Product code. [TODO: to review]', 'unknown tag stays in the description, known ones disappear');
assert(JSON.stringify(U.kind.enum) === '["A","B","C"]', '[enum:] with a comma-separated list');
assert(U.counter.minimum === 10 && U.counter.multipleOf === 5, 'numberic fields are coerced');
assert(U.legacy.nullable === true && U.legacy.readOnly === true, 'nullable/readOnly in 3.x');
assert(U.legacy['x-team'] === 'CORE', '[x-...] is carried over as a vendor extension');
assert(U.bad.minLength === undefined && U.bad.description === '[minLength: abc]',
  'a value of the wrong type is NOT written — the tag remains visible in the description');

const uniSpec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {},
  definitions: {
    P: { type: 'object', properties: {
      opt: { type: 'string', description: '[nullable]' },
      prio: { type: 'integer', description: '[enum: 1, 2, 3]' }
    } }
  }
};
liftDescriptionTags(uniSpec2);
assert(uniSpec2.definitions.P.properties.opt['x-nullable'] === true, 'Swagger2: [nullable] → x-nullable');
assert(JSON.stringify(uniSpec2.definitions.P.properties.prio.enum) === '[1,2,3]', 'enum coerced to integer type');

const nothingSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: { X: { type: 'object', properties: {
    withEnum:    { type: 'string', enum: ['A', 'B'] },
    withFormat:  { type: 'string', format: 'date' },
    withPattern: { type: 'string', pattern: '^\\d{3}$' },
    withDefault: { type: 'string', default: 'hPa' },
    firstName:   { type: 'string' },
    count:       { type: 'integer', minimum: 5 },
    flag:        { type: 'boolean' },
    withMarker:  { type: 'string', description: '[example: "WWW"]' },
    alreadySet:  { type: 'string', example: 'from the model' }
  } } }
};
const nothingStats = applyMarkers(nothingSpec);
const NX = nothingSpec.definitions.X.properties;
for (const empty of ['withEnum', 'withFormat', 'withPattern', 'withDefault', 'firstName', 'count', 'flag']) {
  assert(NX[empty].example === undefined, empty + ': gets no example without a marker');
}
assert(NX.withEnum.enum.length === 2 && NX.withDefault.default === 'hPa', 'the model stays untouched');
assert(NX.withMarker.example === 'WWW', 'example from the marker is set');
assert(NX.alreadySet.example === 'from the model', 'a value already present in the model stays');
assert(nothingStats.examplesAdded === 1, 'exactly one added example is counted');

const spec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/tickets/{id}': {
      get: {
        operationId: 'getTicket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Ticket' } } } } }
      }
    }
  },
  components: {
    schemas: {
      Ticket: {
        type: 'object',
        required: ['number'],
        properties: {
          number: { type: 'string', description: 'Ticket number. [example: TK/2026/000123]' },
          status: { type: 'string', enum: ['NEW', 'APPROVED'] },
          quantity: { type: 'number', minimum: 0.01 },
          unit: { type: 'string', description: 'Unit. [default: hPa]' },
          attachments: { type: 'array', items: { type: 'string', format: 'uri' } },
          contact: { $ref: '#/components/schemas/Contact' },
          ready: { type: 'string', example: 'stays' }
        }
      },
      Contact: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          reference: { type: 'string', pattern: '^\\d{8}$' },
          tricky: { type: 'string', pattern: '^(?!x)y$' }
        }
      }
    }
  }
};
const stats3 = applyMarkers(spec3);
const P = spec3.components.schemas.Ticket.properties;
const K = spec3.components.schemas.Contact.properties;
assert(P.number.example === 'TK/2026/000123', 'example from the [example:] tag');
assert(P.number.description === 'Ticket number.', 'tag removed from the description after being applied');
assert(P.status.example === undefined, 'enum does NOT produce an example — that is what Swagger UI is for');
assert(P.quantity.example === undefined, 'a numberic constraint does not either');
assert(P.unit.default === 'hPa', 'default from the [default:] tag');
assert(P.unit.example === undefined, 'default sets default, not example');
assert(stats3.fromTags === 1 && stats3.defaultsAdded === 1, 'tag counters');
assert(P.attachments.items.example === undefined, 'format on items does not generate either');
assert(P.ready.example === 'stays', 'existing example untouched');
assert(P.contact.example === undefined, 'object referenced via $ref gets no example');
assert(K.firstName.example === undefined, 'no name-based heuristics');
assert(K.reference.example === undefined, 'a pattern does not generate a value');
const paramSchema = spec3.paths['/tickets/{id}'].get.parameters[0].schema;
assert(paramSchema.example === undefined, 'a parameter without a marker stays without an example');

const snapshot = JSON.stringify(spec3);
const stats3b = applyMarkers(spec3);
assert(stats3b.examplesAdded === 0, 'second pass adds nothing');
assert(JSON.stringify(spec3) === snapshot, 'second pass does not change the file');

const spec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/contacts': {
      get: {
        parameters: [
          { name: 'reference', in: 'query', type: 'string', pattern: '^\\d{8}$' },
          { name: 'page', in: 'query', type: 'integer', minimum: 1 },
          { name: 'body', in: 'body', schema: { $ref: '#/definitions/Filter' } }
        ],
        responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Contact' } } }
      }
    }
  },
  definitions: {
    Filter: { type: 'object', properties: { city: { type: 'string' } } },
    Contact: { type: 'object', properties: { lastName: { type: 'string' } } }
  }
};
applyMarkers(spec2);
const params = spec2.paths['/contacts'].get.parameters;
assert(params[0]['x-example'] === undefined, 'Swagger2 param without a marker stays empty');
assert(spec2.definitions.Filter.properties.city.example === undefined, 'fields in definitions are not filled either');

spec2.paths['/contacts'].get.parameters[0].description = 'Reference [example: "00000001"]';
spec2.definitions.Filter.properties.city.description = '[example: "Lisbon"]';
applyMarkers(spec2);
assert(params[0]['x-example'] === '00000001', 'Swagger2 query param with a marker → x-example');
assert(spec2.definitions.Filter.properties.city.example === 'Lisbon', 'field in definitions with a marker');

const specConv = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/x': {
      get: {
        parameters: [{ name: 'channel', in: 'query', type: 'string', description: 'Channel. [example: WWW]' }],
        responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Resp' } } }
      }
    }
  },
  definitions: {
    Resp: {
      type: 'object',
      properties: {
        code: { type: 'string', description: '[example: OK00] [default: OK00]' },
        noTag: { type: 'string' }
      }
    }
  }
};
const liftStats = liftDescriptionTags(specConv);
const O = specConv.definitions.Resp.properties;
assert(O.code.example === 'OK00' && O.code.default === 'OK00', 'lift applies both tags');
assert(O.code.description === undefined, 'a description left empty after tags is removed entirely');
assert(O.noTag.example === undefined, 'lift does NOT run the generator');
assert(specConv.paths['/x'].get.parameters[0]['x-example'] === 'WWW', 'lift: Swagger2 param → x-example');
assert(specConv.paths['/x'].get.parameters[0].description === 'Channel.', 'lift cleans the parameter description');
assert(liftStats.examplesAdded === 2 && liftStats.defaultsAdded === 1, 'lift counters');

const specMedia2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/upload': {
      post: {
        description: 'File upload.\n[consumes: multipart/form-data]\n[produces: application/json, application/xml]',
        consumes: ['application/json'],
        responses: { '200': { description: 'OK' } }
      }
    }
  }
};
const mediaStats2 = applyMarkers(specMedia2);
const opUp = specMedia2.paths['/upload'].post;
assert(JSON.stringify(opUp.consumes) === '["multipart/form-data"]', 'the [consumes:] tag wins over the generator value');
assert(JSON.stringify(opUp.produces) === '["application/json","application/xml"]', '[produces:] with a comma-separated list');
assert(opUp.description === 'File upload.', 'media tags removed from the operation description');
assert(mediaStats2.mediaSet === 2, 'mediaSet counter');

const specOpTags = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/legacy': {
      get: {
        description: 'Legacy operation.\n[operationId: getLegacy] [tags: Sensors, Archive] [deprecated]',
        responses: { '200': { description: 'OK' } }
      }
    }
  }
};
liftDescriptionTags(specOpTags);
const opLegacy = specOpTags.paths['/legacy'].get;
assert(opLegacy.operationId === 'getLegacy', '[operationId:] on an operation');
assert(JSON.stringify(opLegacy.tags) === '["Sensors","Archive"]', '[tags:] with a comma-separated list');
assert(opLegacy.deprecated === true, '[deprecated] on an operation');
assert(opLegacy.description === 'Legacy operation.', 'tags removed from the operation description');

const specFmt = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { X: { type: 'object', properties: {
    od: { type: 'string', description: 'Start date. [format: date]' }
  } } } }
};
applyMarkers(specFmt);
const odProp = specFmt.components.schemas.X.properties.od;
assert(odProp.format === 'date' && odProp.example === undefined, '[format:] sets format and nothing else');
const mediaSnapshot = JSON.stringify(specMedia2);
applyMarkers(specMedia2);
assert(JSON.stringify(specMedia2) === mediaSnapshot, 'media tags are idempotent');

const specMedia3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/docs': {
      post: {
        description: '[consumes: application/xml] [produces: application/xml, application/json]',
        requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'integer' } } } },
          '500': { description: 'Error' }
        }
      }
    }
  }
};
liftDescriptionTags(specMedia3);
const opDocs = specMedia3.paths['/docs'].post;
assert(Object.keys(opDocs.requestBody.content).join() === 'application/xml', '3.x: consumes re-keys requestBody.content');
assert(opDocs.requestBody.content['application/xml'].schema.type === 'string', '3.x: request schema preserved');
assert(Object.keys(opDocs.responses['200'].content).join() === 'application/xml,application/json', '3.x: produces re-keys the response content');
assert(opDocs.responses['200'].content['application/json'].schema.type === 'integer', '3.x: response schema preserved');
assert(opDocs.responses['500'].content === undefined, '3.x: a response without content is untouched');
assert(opDocs.description === undefined, '3.x: a description left empty after tags is removed');

const specNull = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { X: { type: 'object', properties: {
    firstName: { type: 'string', example: null },
    quantity: { type: 'number', default: null, minimum: 5 },
    withTag: { type: 'string', example: null, description: '[example: TK/1]' },
    explicit: { type: 'string', example: 'stays' }
  } } } }
};
const nullStats = applyMarkers(specNull);
const N = specNull.components.schemas.X.properties;
assert(N.firstName.example === null, 'an explicit null stays null — nothing replaces it');
assert(N.quantity.example === undefined, 'a field without a marker stays without an example');
assert(N.withTag.example === 'TK/1', 'the [example:] tag overrides an explicit null');
assert(N.explicit.example === 'stays', 'a value from the model is untouched');
assert(nullStats.examplesAdded === 1, 'only the example from the marker is counted');

const specRefTag = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: {
    MeasuredValue: {
      type: 'object',
      properties: {
        value: { $ref: '#/components/schemas/TypedValue', description: '[example: RD-102934]' },
        type: { $ref: '#/components/schemas/TypedValue', description: '[example: 1]' }
      }
    },

    TypedValue: { type: 'string' }
  } }
};
const refTagStats = applyMarkers(specRefTag);
const R = specRefTag.components.schemas.MeasuredValue.properties;
assert(R.value.example === 'RD-102934', 'an [example:] tag on a $ref field (next to the reference) ends up in example');
assert(R.type.example === '1', 'same for the second $ref field in the same object');
assert(R.value.description === undefined, 'tag removed from the description after being applied — idempotence');
assert(specRefTag.components.schemas.TypedValue.example === undefined,
  'a shared type without a marker stays without an example');
assert(R.value.example === 'RD-102934' && R.type.example === '1',
  'local tags on $ref fields are NOT overwritten by the shared type\'s general example');
assert(refTagStats.fromTags >= 2, 'the counter counts both tagged $ref fields');

const refTagSnapshot = JSON.stringify(specRefTag);
applyMarkers(specRefTag);
assert(JSON.stringify(specRefTag) === refTagSnapshot, 'tagged $ref fields: second pass is idempotent');

assert(coerceValue('null', 'string') === null, 'a bare null in a string field is JS null, not the text "null"');
assert(coerceValue('null', null) === null, 'a bare null with no known type is JS null');
assert(coerceValue('"null"', 'string') === 'null', 'a quoted "null" is literal text — the escape hatch');

const nullSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { X: { type: 'object', properties: {
    code: { type: 'string', description: '[example: null]' },
    list: { type: 'array', items: { type: 'string' }, description: '[example: null]' },
    emptyList: { type: 'array', items: { type: 'string' }, description: '[example: []]' },
    textNull: { type: 'string', description: '[example: "null"]' }
  } } } }
};
applyMarkers(nullSpec);
const NS = nullSpec.components.schemas.X.properties;
assert(NS.code.example === null, 'scalar: the [example: null] tag survives the same pass — the generator does not overwrite it');
assert(NS.list.example === null, 'array: [example: null] stays a real null, not [null] nor a generated array');
assert(Array.isArray(NS.emptyList.example) && NS.emptyList.example.length === 0, '[example: []] yields an empty array');
assert(NS.textNull.example === 'null', 'a quoted [example: "null"] yields literal text, not JS null');

const listSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { D: { type: 'object', properties: {

    methods: { type: 'array', items: { type: 'string', description: 'Available ways [example: ["RQST","MAIL"]]' } },

    channels: { type: 'array', items: { type: 'string' }, description: 'List [example: ["WWW"]]' },

    single: { type: 'array', items: { type: 'string' }, description: '[example: RQST]' },

    element: { type: 'array', items: { type: 'string', description: '[example: RQST]' } },

    codes: { type: 'array', items: { type: 'integer', description: '[example: [1,2]]' } },

    types: { type: 'array', items: { $ref: '#/components/schemas/Code', description: '[example: ["A"]]' } },

    matrix: { type: 'array', items: { type: 'array', items: { type: 'integer' }, description: '[example: [1,2]]' } },

    withPattern: { type: 'array', items: { type: 'string', description: '[example: ["AB"]] [pattern: ^[A-Z]{2}$]' } }
  } }, Code: { type: 'string' } } }
};
applyMarkers(listSpec);
const L = listSpec.components.schemas.D.properties;
const eq = (v, s) => JSON.stringify(v) === s;
assert(eq(L.methods.example, '["RQST","MAIL"]'), 'a list from the item note lands on the array');
assert(L.methods.items.example === undefined, 'the item does not get the list as its own example');
assert(L.methods.items.description === 'Available ways', 'tag removed from the item description');
assert(eq(L.channels.example, '["WWW"]'), 'a list from the array note stays on the array');
assert(eq(L.single.example, '["RQST"]'), 'a single value on the array is wrapped in a one-element list');
assert(L.element.items.example === 'RQST' && L.element.example === undefined, 'a single value on the item stays on the item');
assert(eq(L.codes.example, '[1,2]') && L.codes.items.example === undefined, 'a list of numbers lands on the array');
assert(eq(L.types.example, '["A"]') && listSpec.components.schemas.Code.example === undefined,
  '$ref item: example on the array, the shared type untouched');
assert(eq(L.matrix.items.example, '[1,2]') && L.matrix.example === undefined,
  'list of lists: the array value stays on the item, which is itself an array');
assert(eq(L.withPattern.example, '["AB"]') && L.withPattern.items.pattern === '^[A-Z]{2}$',
  'pattern describes the item and stays on it, the example goes onto the array');
assert(L.withPattern.items.example === undefined,
  'an item without its own marker stays without an example');

const listSnapshot = JSON.stringify(listSpec);
applyMarkers(listSpec);
assert(JSON.stringify(listSpec) === listSnapshot, 'arrays: second pass is idempotent');

const fitSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { L: { type: 'object', properties: {
    reading: { type: 'number', description: 'Limit quantity [pattern: ^\\d+\\.\\d{2}$] [example: 5000.00]' },
    counter: { type: 'integer', description: '[minLength: 3]' },
    text: { type: 'string', description: '[minimum: 1]' },
    text2: { type: 'string', description: '[uniqueItems]' },
    broken: { type: 'string', description: '[pattern: ^(]' },
    good: { type: 'string', description: '[pattern: ^[A-Z]{2}$]' },
    list: { type: 'array', items: { type: 'string' }, description: '[minItems: 1] [uniqueItems]' },
    objField: { type: 'object', properties: {}, description: '[minProperties: 1]' }
  } } } }
};
const fitStats = applyMarkers(fitSpec);
const F = fitSpec.components.schemas.L.properties;
assert(F.reading.pattern === undefined, '[pattern:] does not land on a numberic field');
assert(/\[pattern:/.test(F.reading.description), 'a non-matching [pattern:] stays in the description, visible');
assert(F.reading.example === 5000, 'the example from the same note still works (JSON does not know 5000.00)');
assert(F.counter.minLength === undefined && /\[minLength:/.test(F.counter.description), '[minLength:] only on a string');
assert(F.text.minimum === undefined && /\[minimum:/.test(F.text.description), '[minimum:] only on a number');
assert(F.text2.uniqueItems === undefined, '[uniqueItems] only on an array');
assert(F.broken.pattern === undefined && /\[pattern:/.test(F.broken.description), 'an invalid regex is not written');
assert(F.good.pattern === '^[A-Z]{2}$', 'a valid [pattern:] on a string still works');
assert(F.list.minItems === 1 && F.list.uniqueItems === true, 'array fields work on an array');
assert(F.objField.minProperties === 1, 'object fields work on an object');

const mismatchSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { M: { type: 'object', properties: {
    wrong: { type: 'string', description: 'Quantity [pattern: ^\\\\d+\\\\.\\\\d{2}$] [example: 5000.00]' },
    right: { type: 'string', description: 'Quantity [pattern: ^\\d+\\.\\d{2}$] [example: 5000.00]' },
    fromModel: { type: 'string', pattern: '^[A-Z]{2}$', example: 'abc' }
  } } } }
};
const mismatchStats = applyMarkers(mismatchSpec);
assert(mismatchStats.mismatched.indexOf('M.wrong') >= 0, 'doubled backslashes caught as an example/pattern mismatch');
assert(mismatchStats.mismatched.indexOf('M.right') < 0, 'a correct pattern is not reported');
assert(mismatchStats.mismatched.indexOf('M.fromModel') >= 0, 'a mismatch straight from the model (no markers) is seen too');

const quoteSpec = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: { '/x': { get: {
    description: 'Something. [operationId: getX] [tags: "Alerts, Reports", "Sensors"]',
    responses: { '200': { description: 'OK' } }
  } } },
  definitions: { Q: { type: 'object', properties: {
    code: { type: 'string', description: '[example: "0012"]' },
    withBracket: { type: 'string', description: 'Note [example: "a]b, c"] end' },
    withSpace: { type: 'string', description: '[example: "  indent  "]' },
    patternField: { type: 'string', description: '[pattern: "^[A-Z]{2}$"] [example: "AB"]' },
    listWithComma: { type: 'array', items: { type: 'string', description: '[example: ["A,B", "C"]]' } },
    enumWithComma: { type: 'string', description: '[enum: "A,B", "C"]' },
    quantity: { type: 'number', description: 'Quantity [example: "5000.00"]' },
    flag: { type: 'boolean', description: '[example: "true"]' },
    enumOfNumbers: { type: 'integer', description: '[enum: "1", "2"]' }
  } } }
};
const quoteStats = applyMarkers(quoteSpec);
const Q = quoteSpec.definitions.Q.properties;
assert(Q.code.example === '0012', 'quoted text stays text');
assert(Q.withBracket.example === 'a]b, c', 'quotes protect ] and , inside the value');
assert(Q.withBracket.description === 'Note end', 'the quoted tag is removed in full');
assert(Q.withSpace.example === '  indent  ', 'quotes preserve leading and trailing spaces');
assert(Q.patternField.pattern === '^[A-Z]{2}$' && Q.patternField.example === 'AB', 'a quoted pattern works');
assert(JSON.stringify(Q.listWithComma.example) === '["A,B","C"]', 'a comma inside quotes does not split the list');
assert(JSON.stringify(Q.enumWithComma.enum) === '["A,B","C"]', 'same in a comma-separated enum');
assert(Q.quantity.example === undefined && /\[example:/.test(Q.quantity.description),
  'quotes do not fit a numberic field — the marker stays in the description');
assert(Q.flag.example === undefined, 'same on a boolean field');
assert(Q.enumOfNumbers.enum === undefined && /\[enum:/.test(Q.enumOfNumbers.description),
  'a quoted enum of numbers: the whole marker stays, not half the list');
assert(JSON.stringify(quoteSpec.paths['/x'].get.tags) === '["Alerts, Reports","Sensors"]',
  'operation tag list: a comma inside quotes belongs to the value');
assert(quoteStats.tagFields > 0, 'quoted markers were counted');

const quotedKinds = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: { '/y': { post: {
    description: 'Something. [operationId: "createStation"] [summary: "Register a station"] [tags: "Stations", "Sensors"] [consumes: "application/json", "application/xml"] [produces: "application/json"] [x-source: "EA"]',
    responses: { '200': { description: 'OK' } }
  } } },
  definitions: { K: { type: 'object', properties: {
    data: { type: 'string', description: '[format: "date"] [example: "2026-03-01"]' },
    time: { type: 'string', description: '[format: "date-time"] [example: "2026-01-01T12:00:00Z"]' },
    uid: { type: 'string', description: '[format: "uuid"] [example: "3f2504e0-4f89-41d3-9a0c-0305e82c3301"]' },
    status: { type: 'string', description: '[enum: "ACTIVE", "CLOSED"] [default: "ACTIVE"]' },
    enumJson: { type: 'string', description: '[enum: ["A", "B"]] [example: "A"]' },
    titleField: { type: 'string', description: '[title: "Station serial"]' }
  } } }
};
applyMarkers(quotedKinds);
const QK = quotedKinds.definitions.K.properties;
const quotedOp = quotedKinds.paths['/y'].post;
assert(QK.data.format === 'date' && QK.data.example === '2026-03-01', 'quoted date');
assert(QK.time.example === '2026-01-01T12:00:00Z', 'quoted date-time');
assert(QK.uid.format === 'uuid' && QK.uid.example === '3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'quoted uid');
assert(JSON.stringify(QK.status.enum) === '["ACTIVE","CLOSED"]' && QK.status.default === 'ACTIVE', 'quoted enum values and default');
assert(JSON.stringify(QK.enumJson.enum) === '["A","B"]', 'enum written as a JSON array');
assert(QK.titleField.title === 'Station serial', 'quoted title');
assert(quotedOp.operationId === 'createStation' && quotedOp.summary === 'Register a station', 'quoted operation fields');
assert(JSON.stringify(quotedOp.consumes) === '["application/json","application/xml"]', 'quoted consumes');
assert(JSON.stringify(quotedOp.produces) === '["application/json"]', 'quoted produces');
assert(quotedOp['x-source'] === 'EA', 'quoted vendor extension');

const summarySpec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: { '/a': { post: {
    summary: 'Register a station [consumes: "application/json", "application/xml"] [produces: "application/xml"]',
    description: 'Registers a station. [operationId: "createStation"] [tags: "Stations"]',
    responses: { '200': { description: 'OK' } }
  } } }
};
const summaryStats = liftDescriptionTags(summarySpec2);
const sop = summarySpec2.paths['/a'].post;
assert(JSON.stringify(sop.consumes) === '["application/json","application/xml"]', 'consumes from a marker in summary');
assert(JSON.stringify(sop.produces) === '["application/xml"]', 'produces from a marker in summary');
assert(sop.summary === 'Register a station', 'marker removed from summary, the content stays');
assert(sop.operationId === 'createStation' && JSON.stringify(sop.tags) === '["Stations"]', 'description still works alongside summary');
assert(summaryStats.mediaSet === 2, 'both media types counted');

const summarySpec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/a': { post: {
    summary: 'Register a station [consumes: "application/xml"] [produces: "application/xml"]',
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } }
  } } }
};
liftDescriptionTags(summarySpec3);
const sop3 = summarySpec3.paths['/a'].post;
assert(Object.keys(sop3.requestBody.content)[0] === 'application/xml', '3.x: consumes from summary re-keys requestBody');
assert(Object.keys(sop3.responses['200'].content)[0] === 'application/xml', '3.x: produces from summary re-keys the response');
assert(sop3.summary === 'Register a station', '3.x: summary cleaned up');

const selfSummary = { swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/b': { get: { summary: 'old text [summary: "Read a station"]', responses: {} } } } };
liftDescriptionTags(selfSummary);
assert(selfSummary.paths['/b'].get.summary === 'Read a station', '[summary:] inside summary overwrites the content, does not vanish');

const onlyTag = { swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/c': { get: { summary: '[produces: "application/json"]', responses: {} } } } };
liftDescriptionTags(onlyTag);
assert(onlyTag.paths['/c'].get.summary === undefined, 'an empty summary is removed, does not stay ""');
assert(JSON.stringify(onlyTag.paths['/c'].get.produces) === '["application/json"]', 'the value from the marker is applied');

const plainSummary = { swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/d': { get: { summary: 'A plain operation title', description: 'text [tags: "A"]', responses: {} } } } };
liftDescriptionTags(plainSummary);
assert(plainSummary.paths['/d'].get.summary === 'A plain operation title', 'a summary without markers is untouched');

const q = (raw, type) => exampleTagValue({ type: type || 'string', description: 'Text [example: ' + raw + '] end' });
assert(q('""') === '', 'an empty quoted string');
assert(q('"they said \\"yes\""') === 'they said "yes"', 'a quote inside the content, JSON-style (\\")');
assert(q('"field \\"code\" and \"type\""') === 'field "code" and "type"', 'several quotes inside the content');
assert(q('"\\""') === '"', 'a lone quote as the whole value');
assert(q('"a\\\\b"') === 'a\\b', 'a double backslash inside quotes is one backslash, as in JSON');
assert(q('"first\\nsecond"') === 'first\\nsecond', 'other escapes stay literal — \\n is not a newline');
assert(q('"C:\\reports"') === 'C:\\reports', 'a path with a backslash stays a path (JSON would turn \\r into a carriage return)');
assert(q('"5" inch"') === '5" inch', 'an unbalanced quote: the marker is still read, the content taken literally');
assert(q('"a]b, c"') === 'a]b, c', 'bracket and comma inside quotes are still protected');

const escSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/x': { get: { description: 'op [summary: "report \"daily\""]', responses: {} } } },
  definitions: { E: { type: 'object', properties: {
    patternField: { type: 'string', description: '[pattern: "^\\\\d+$"] [example: "12345"]' },
    literal: { type: 'string', description: '[pattern: ^\\\\d+$] [example: "12345"]' },
    titleField: { type: 'string', description: '[title: "field \\"code\\""]' },
    list: { type: 'string', description: '[enum: "a\\"b", "c"]' }
  } } }
};
const escStats = applyMarkers(escSpec);
const E = escSpec.definitions.E.properties;
assert(escSpec.paths['/x'].get.summary === 'report "daily"', 'a quote inside summary content');
assert(E.patternField.pattern === '^\\d+$', 'inside quotes \\\\d is one backslash — a valid digits pattern');
assert(escStats.mismatched.indexOf('E.patternField') < 0, 'a correct pattern is not reported');
assert(E.literal.pattern === '^\\\\d+$', 'without quotes the content is literal — the double backslash stays');
assert(escStats.mismatched.indexOf('E.literal') >= 0, 'the literal double backslash does not match the example and is reported');
assert(E.titleField.title === 'field "code"', 'a quote inside title content');
assert(JSON.stringify(E.list.enum) === '["a\\"b","c"]', 'a quote inside an enum value');

const refSpec = (root) => Object.assign({ info: { title: 'T', version: '1' }, paths: {}, definitions: {
  Station: { type: 'object', properties: {
    quantity: { $ref: '#/definitions/Shared_Quantity', description: 'Limit quantity [example: "5000.00"] [format: "decimal"]' },
    noMarker: { $ref: '#/definitions/Shared_Quantity' }
  } },
  Shared_Quantity: { type: 'string', description: 'Shared type' }
} }, root);

const ref2 = refSpec({ swagger: '2.0' });
const ref2Stats = applyMarkers(ref2);
const R2 = ref2.definitions.Station.properties;
assert(R2.quantity.$ref === undefined, '2.0: bare $ref replaced by the wrapper');
assert(JSON.stringify(R2.quantity.allOf) === '[{"$ref":"#/definitions/Shared_Quantity"}]', '2.0: reference preserved inside allOf');
assert(R2.quantity.example === '5000.00' && R2.quantity.format === 'decimal', '2.0: values from the note next to allOf');
assert(R2.quantity.description === 'Limit quantity', '2.0: the description stays on the wrapper, where it takes effect');
assert(ref2Stats.refsWrapped === 1, 'the wrap counted in the report');
assert(R2.noMarker.$ref === '#/definitions/Shared_Quantity' && R2.noMarker.allOf === undefined,
  'a field without a marker is not touched');
assert(JSON.stringify(ref2.definitions.Shared_Quantity) === JSON.stringify({ type: 'string', description: 'Shared type' }),
  'the shared type is untouched — that is the whole point of this exercise');

const ref30 = refSpec({ openapi: '3.0.3' });
applyMarkers(ref30);
assert(ref30.definitions.Station.properties.quantity.allOf !== undefined, '3.0: same as in 2.0');

const ref31 = refSpec({ openapi: '3.1.0' });
const ref31Stats = applyMarkers(ref31);
const R31 = ref31.definitions.Station.properties;
assert(R31.quantity.$ref === '#/definitions/Shared_Quantity' && R31.quantity.allOf === undefined,
  '3.1: siblings of $ref are legal, so the structure is left alone');
assert(R31.quantity.example === '5000.00', '3.1: value next to the reference');
assert(ref31Stats.refsWrapped === 0, '3.1: nothing was wrapped');

const wrappedSnapshot = JSON.stringify(ref2);
const secondRun = applyMarkers(ref2);
assert(JSON.stringify(ref2) === wrappedSnapshot && secondRun.refsWrapped === 0, 'the wrapping is idempotent');

function effectiveExample(node, defs, depth) {
  if (!node || typeof node !== 'object' || (depth || 0) > 10) return undefined;
  if (node.example !== undefined) return node.example;
  if (node.$ref) return effectiveExample(defs[String(node.$ref).split('/').pop()], defs, (depth || 0) + 1);
  for (const part of node.allOf || []) {
    const v = effectiveExample(part, defs, (depth || 0) + 1);
    if (v !== undefined) return v;
  }
  return undefined;
}

const precSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: {
    Station: { type: 'object', properties: {
      withOwn: { $ref: '#/definitions/Shared_Quantity', description: 'Limit quantity [example: "5000.00"]' },
      withoutOwn: { $ref: '#/definitions/Shared_Quantity', description: 'Another quantity, without its own example' }
    } },
    Shared_Quantity: { type: 'string', description: 'Shared type [example: "0.00"]' }
  }
};
applyMarkers(precSpec);
const D = precSpec.definitions;
assert(effectiveExample(D.Station.properties.withOwn, D) === '5000.00',
  'a field with its own marker shows ITS OWN example, not the shared type\'s');
assert(effectiveExample(D.Station.properties.withoutOwn, D) === '0.00',
  'a field without its own marker falls back to the shared type\'s example');
assert(D.Shared_Quantity.example === '0.00', 'the shared type keeps its example for the remaining usages');
assert(D.Station.properties.withOwn.allOf !== undefined,
  'this wrapper is what makes the field\'s own example visible at all');

const prec31Spec = {
  openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {},
  components: { schemas: {
    Station: { type: 'object', properties: {
      withOwn: { $ref: '#/components/schemas/Shared_Quantity', description: 'Quantity [example: "5000.00"]' },
      withoutOwn: { $ref: '#/components/schemas/Shared_Quantity' }
    } },
    Shared_Quantity: { type: 'string', description: '[example: "0.00"]' }
  } }
};
applyMarkers(prec31Spec);
const S31 = prec31Spec.components.schemas;
assert(effectiveExample(S31.Station.properties.withOwn, S31) === '5000.00', '3.1: the field\'s own example wins');
assert(effectiveExample(S31.Station.properties.withoutOwn, S31) === '0.00', '3.1: no own example → the type\'s example');

const spreadSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: {
    Ticket: { type: 'object', properties: {
      details: { $ref: '#/definitions/Shared_Details', description: 'Details [exampleBody: {"channel": "MAIL", "region": "260", "limit": {"reading": "1000.00"}, "tags": ["A", "B"], "typo": 1}]' },
      whole:   { $ref: '#/definitions/Shared_Details', description: 'Whole [example: {"channel": "SMS"}]' },
      rows:    { type: 'array', items: { $ref: '#/definitions/Shared_Row' }, description: 'Rows [exampleBody: [{"role": "23", "allowed": true}]]' }
    } },
    Shared_Details: { type: 'object', properties: {
      channel: { $ref: '#/definitions/Shared_Channel' },
      region:  { type: 'string' },
      limit:   { type: 'object', properties: { reading: { type: 'string' } } },
      tags:    { type: 'array', items: { type: 'string' } }
    } },
    Shared_Row: { type: 'object', properties: { role: { type: 'string' }, allowed: { type: 'boolean' } } },
    Shared_Channel: { type: 'string', description: '[enum: "RQST", "MAIL", "SMS"]' }
  }
};
const spreadStats = applyMarkers(spreadSpec);
const SD = spreadSpec.definitions;
assert(SD.Shared_Details.properties.region.example === '260', '[exampleBody:] assigns the example to the field underneath');
assert(SD.Shared_Details.properties.channel.example === 'MAIL', 'a field typed with the shared type also gets its own example');
assert(SD.Shared_Details.properties.channel.allOf !== undefined, 'the $ref field is wrapped so the example is not dead');
assert(SD.Shared_Details.properties.limit.properties.reading.example === '1000.00', 'the spread descends into nested objects');
assert(JSON.stringify(SD.Shared_Details.properties.tags.example) === '["A","B"]', 'a list lands at the array field');
assert(JSON.stringify(SD.Ticket.properties.details.example) ===
  '{"channel":"MAIL","region":"260","limit":{"reading":"1000.00"},"tags":["A","B"]}',
  '[exampleBody:] also leaves the whole example on the field — without it the payload would show fields outside the note');
assert(spreadStats.unknownKeys.indexOf('typo') >= 0, 'a key outside the model is reported, not inserted silently');
assert(SD.Shared_Details.properties.typo === undefined, 'and indeed not added to the structure');

assert(JSON.stringify(SD.Ticket.properties.whole.example) === '{"channel":"SMS"}', '[example:] still works the old way');

assert(SD.Shared_Row.properties.role.example === '23' && SD.Shared_Row.properties.allowed.example === true,
  '[exampleBody:] from an array spreads onto the item\'s fields');

const spreadSnapshot = JSON.stringify(spreadSpec);
applyMarkers(spreadSpec);
assert(JSON.stringify(spreadSpec) === spreadSnapshot, '[exampleBody:] is idempotent');

const badSpread = { swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: { X: { type: 'object', properties: { a: { type: 'string', description: '[exampleBody: whatever]' } } } } };
applyMarkers(badSpread);
assert(/\[exampleBody:/.test(badSpread.definitions.X.properties.a.description), '[exampleBody:] without JSON stays visible in the description');

const bodySpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: {
    W: { type: 'object', properties: {
      d: { $ref: '#/definitions/D', description: 'Details [exampleBody: {"a": "x", "c": {"d": 1}}]' },
      list: { type: 'array', items: { $ref: '#/definitions/Row' }, description: 'List [exampleBody: {"role": "23"}]' },
      composed: { $ref: '#/definitions/Composed', description: 'Composed [exampleBody: {"e": "y"}]' },
      scalar: { type: 'string', description: 'Scalar [exampleBody: {"a": 1}]' },
      broken: { type: 'object', properties: { a: { type: 'string' } }, description: 'Broken [exampleBody: {"a": 1,}]' }
    } },
    D: { type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' }, c: { type: 'object', properties: { d: { type: 'integer' } } } } },
    Row: { type: 'object', properties: { role: { type: 'string' } } },
    Composed: { allOf: [ { $ref: '#/definitions/Base' } ] },
    Base: { type: 'object', properties: { e: { type: 'string' } } }
  }
};
const bodyStats = applyMarkers(bodySpec);
const BW = bodySpec.definitions.W.properties;
assert(JSON.stringify(BW.d.example) === '{"a":"x","c":{"d":1}}', 'the example in full on the field — the payload will show only the given fields');
assert(bodySpec.definitions.D.properties.a.example === 'x', 'and at the same time spread onto the fields');
assert(bodySpec.definitions.D.properties.c.properties.d.example === 1, 'the spread descends deep');
assert(bodySpec.definitions.D.properties.b.example === undefined, 'a field omitted from the note gets no example');
assert(JSON.stringify(BW.list.example) === '[{"role":"23"}]', 'an object written for a list describes one row');
assert(bodySpec.definitions.Row.properties.role.example === '23', 'and spreads onto the item\'s fields');
assert(bodySpec.definitions.Base.properties.e.example === 'y', 'a type composed with allOf is found too');
assert(bodyStats.notApplied.some((n) => /scalar/.test(n.path)), 'scalar: the marker is not applied and is reported');
assert(bodyStats.notApplied.some((n) => /broken/.test(n.path) && /JSON/.test(n.reason)), 'broken JSON is reported with a reason');
assert(/\[exampleBody:/.test(BW.scalar.description), 'an unapplied marker stays visible in the description');

const bodySnapshot = JSON.stringify(bodySpec);
applyMarkers(bodySpec);
assert(JSON.stringify(bodySpec) === bodySnapshot, '[exampleBody:] is idempotent');

const respSpec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/tickets': { get: {
    description: 'Reading tickets. [response: 404 "Ticket not found" {"code": "NOT_FOUND"}] [response: 409] [response: 200 "OK — list of tickets"] [response: 5XX "Server error"]',
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } }
  } } }
};
const respStats3 = applyMarkers(respSpec3);
const respOp3 = respSpec3.paths['/tickets'].get;
assert(respOp3.responses['404'].description === 'Ticket not found', '[response:] adds a code with its description');
assert(JSON.stringify(respOp3.responses['404'].content['application/json'].example) === '{"code":"NOT_FOUND"}',
  '3.x: the JSON example lands in content, under the media type used by the other responses');
assert(respOp3.responses['409'].description === 'Conflict', 'a bare code gets the standard HTTP reason phrase');
assert(respOp3.responses['200'].description === 'OK — list of tickets', 'an existing response only updates its description');
assert(respOp3.responses['200'].content['application/json'].schema.type === 'object', 'the existing content is untouched');
assert(respOp3.responses['5XX'].description === 'Server error', '3.x: a code range such as 5XX is allowed');
assert(respOp3.description === 'Reading tickets.', 'response markers removed from the description');
assert(respStats3.responsesAdded === 3, 'three new responses counted (200 already existed)');
assert(respStats3.examplesAdded === 1, 'the response example is counted');

const respSnapshot3 = JSON.stringify(respSpec3);
applyMarkers(respSpec3);
assert(JSON.stringify(respSpec3) === respSnapshot3, '[response:] is idempotent');

const respSpec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  produces: ['application/json'],
  paths: { '/alerts': { post: {
    produces: ['application/xml'],
    summary: 'Alert [response: 500 {"error": "X"}] [response: 4XX] [response: default "General error"] [response: 403 Not authorised]',
    responses: {}
  } } }
};
const respStats2 = applyMarkers(respSpec2);
const respOp2 = respSpec2.paths['/alerts'].post;
assert(respOp2.responses['500'].description === 'Internal Server Error', 'Swagger2: default reason phrase');
assert(JSON.stringify(respOp2.responses['500'].examples['application/xml']) === '{"error":"X"}',
  'Swagger2: the example lands in examples under the operation produces type');
assert(respOp2.responses['default'].description === 'General error', 'the default response works');
assert(respOp2.responses['403'].description === 'Not authorised', 'an unquoted description is accepted');
assert(respOp2.responses['4XX'] === undefined, 'Swagger2: a code range is NOT applied');
assert(/\[response: 4XX\]/.test(respOp2.summary), 'the rejected range marker stays visible in summary');
assert(respStats2.notApplied.some((n) => n.path === 'POST /alerts' && /4XX/.test(n.reason)),
  'the rejected range is reported with the operation label');

const respMixed = {
  openapi: '3.1.0',
  info: { title: 'T', version: '1' },
  paths: { '/x': { get: {
    description: '[response: 410 Resource removed {"gone": true}] [response: 999] [response: 404 "X" {broken}] [response: 302]',
    responses: { '302': { $ref: '#/components/responses/Redirect' } }
  } } },
  components: { responses: { Redirect: { description: 'Redirection' } } }
};
const respStatsMixed = applyMarkers(respMixed);
const respOpMixed = respMixed.paths['/x'].get;
assert(respOpMixed.responses['410'].description === 'Resource removed', 'unquoted description followed by JSON: split correctly');
assert(respOpMixed.responses['410'].content['application/json'].example.gone === true,
  'the JSON tail after an unquoted description becomes the example');
assert(respOpMixed.responses['999'] === undefined && /\[response: 999\]/.test(respOpMixed.description),
  'an invalid status code stays in the description');
assert(respOpMixed.responses['404'] === undefined && /broken/.test(respOpMixed.description),
  'broken JSON: the marker is not applied');
assert(respStatsMixed.notApplied.some((n) => /JSON/.test(n.reason)), 'broken JSON is reported with a reason');
assert(respOpMixed.responses['302'].$ref === '#/components/responses/Redirect',
  'a $ref response is untouched and the marker is reported');
assert(respStatsMixed.notApplied.some((n) => /\$ref/.test(n.reason)), '$ref response reported');

const respSchemaCheck3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/errors': { get: {
    description: '[response: 404 {"code": "NOT_FOUND", "details": {"field": "id", "typo": 1}, "whollyForeign": true}] [response: 409 {"code": "CONFLICT"}]',
    responses: {
      '404': { description: 'old text', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } } },
      '409': { description: 'Conflict', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorBody' } } } }
    }
  } } },
  components: { schemas: {
    ErrorBody: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        details: { type: 'object', properties: { field: { type: 'string' } } }
      }
    }
  } }
};
const schemaCheckStats = applyMarkers(respSchemaCheck3);
const checkedOp = respSchemaCheck3.paths['/errors'].get;
assert(checkedOp.responses['404'].content['application/json'].example.code === 'NOT_FOUND',
  'the example is applied even when some keys are unknown — like [exampleBody:]');
assert(schemaCheckStats.unknownKeys.indexOf('GET /errors 404.whollyForeign') >= 0,
  'a key outside the response schema is reported with the operation and code');
assert(schemaCheckStats.unknownKeys.indexOf('GET /errors 404.details.typo') >= 0,
  'the check descends into nested objects');
assert(schemaCheckStats.unknownKeys.indexOf('GET /errors 404.code') < 0 &&
  schemaCheckStats.unknownKeys.indexOf('GET /errors 409.code') < 0,
  'keys present in the model are not reported');
assert(checkedOp.responses['404'].content['application/json'].example !== checkedOp.responses['409'].content['application/json'].example,
  'each code keeps its own example even though both share the ErrorBody schema');
assert(respSchemaCheck3.components.schemas.ErrorBody.properties.code.example === undefined,
  'the shared schema stays untouched — per-code examples live on the responses');

const respSchemaCheck2 = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/list': { get: {
    description: '[response: 400 [{"reason": "X", "foreign": 1}]]',
    responses: { '400': { description: 'Error', schema: { type: 'array', items: { $ref: '#/definitions/Reason' } } } }
  } } },
  definitions: { Reason: { type: 'object', properties: { reason: { type: 'string' } } } }
};
const schemaCheckStats2 = applyMarkers(respSchemaCheck2);
assert(JSON.stringify(respSchemaCheck2.paths['/list'].get.responses['400'].examples['application/json']) ===
  '[{"reason":"X","foreign":1}]', 'Swagger2: a list example lands in examples');
assert(schemaCheckStats2.unknownKeys.indexOf('GET /list 400[].foreign') >= 0,
  'Swagger2: list items are checked against the item schema');
assert(schemaCheckStats2.unknownKeys.indexOf('GET /list 400[].reason') < 0, 'Swagger2: a known item key is fine');

const respBodySpec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/jobs': { post: {
    description: 'A job. [response: 404 "Not found" #ErrorBody {"code": "NOT_FOUND", "bad": 1}] [response: 409 #/components/schemas/ErrorBody] [response: 410 #DoesNotExist] [response: 422 {"code": "X"}]',
    responses: { '200': { description: 'OK', content: { 'application/xml': { schema: { type: 'object' } } } } }
  } } },
  components: { schemas: { ErrorBody: { type: 'object', properties: { code: { type: 'string' } } } } }
};
const respBodyStats3 = applyMarkers(respBodySpec3);
const respBodyOp3 = respBodySpec3.paths['/jobs'].post;
assert(respBodyOp3.responses['404'].content['application/xml'].schema.$ref === '#/components/schemas/ErrorBody',
  '3.x: #ErrorBody becomes the body schema, under the media type the operation already uses');
assert(respBodyOp3.responses['404'].content['application/xml'].example.code === 'NOT_FOUND',
  'the example sits next to the body schema');
assert(respBodyStats3.unknownKeys.indexOf('POST /jobs 404.bad') >= 0,
  'the example is checked against the body schema given in the same marker');
assert(respBodyOp3.responses['404'].description === 'Not found', 'description + schema + example in one marker');
assert(respBodyOp3.responses['409'].content['application/xml'].schema.$ref === '#/components/schemas/ErrorBody',
  'a full JSON pointer also works, without an example');
assert(respBodyOp3.responses['409'].description === 'Conflict', 'schema-only marker still gets the reason phrase');
assert(respBodyOp3.responses['410'] === undefined && /#DoesNotExist/.test(respBodyOp3.description),
  'a schema that does not exist in the file: the marker stays visible');
assert(respBodyStats3.notApplied.some((n) => /DoesNotExist/.test(n.reason)), 'and is reported with a reason');
assert(respBodyOp3.responses['422'].content['application/xml'].schema === undefined,
  'a marker without # adds no schema — the example stands alone');

const respBodySnapshot3 = JSON.stringify(respBodySpec3);
applyMarkers(respBodySpec3);
assert(JSON.stringify(respBodySpec3) === respBodySnapshot3, 'body schema markers are idempotent');

const respBodySpec2 = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/jobs': { post: {
    summary: 'A job [response: 500 Internal failure #ErrorBody {"code": "ERR"}]',
    responses: {}
  } } },
  definitions: { ErrorBody: { type: 'object', properties: { code: { type: 'string' } } } }
};
applyMarkers(respBodySpec2);
const respBodyOp2 = respBodySpec2.paths['/jobs'].post;
assert(respBodyOp2.responses['500'].schema.$ref === '#/definitions/ErrorBody', 'Swagger2: the body schema lands in schema');
assert(respBodyOp2.responses['500'].description === 'Internal failure',
  'an unquoted description ends where the #schema token starts');
assert(JSON.stringify(respBodyOp2.responses['500'].examples['application/json']) === '{"code":"ERR"}',
  'Swagger2: the example still lands in examples');
assert(respBodyOp2.summary === 'A job', 'the marker is removed from summary');

const respOrderSpec = {
  openapi: '3.1.0', info: { title: 'T', version: '1' },
  paths: { '/order': { get: {
    description: '[response: 4XX "Client"] [response: 5XX "Server"] [response: default "Default"]',
    responses: {}
  } } }
};
applyMarkers(respOrderSpec);
assert(Object.keys(respOrderSpec.paths['/order'].get.responses).join() === '4XX,5XX,default',
  'non-numberic codes keep the order they were written in, not the reverse');

const respNoResponses = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/y': { delete: { description: '[response: 204]' } } }
};
applyMarkers(respNoResponses);
assert(respNoResponses.paths['/y'].delete.responses['204'].description === 'No Content',
  'an operation without a responses object gets one');


const nullableByVersion = (root, host) => {
  const spec = Object.assign({ info: { title: 'T', version: '1' }, paths: {} }, root,
    host === 'definitions'
      ? { definitions: { P: { type: 'object', properties: { a: { type: 'string', description: '[nullable]' } } } } }
      : { components: { schemas: { P: { type: 'object', properties: { a: { type: 'string', description: '[nullable]' } } } } } });
  applyMarkers(spec);
  return (spec.definitions || spec.components.schemas).P.properties.a;
};
const nul20 = nullableByVersion({ swagger: '2.0' }, 'definitions');
assert(nul20['x-nullable'] === true && nul20.nullable === undefined,
  '[nullable] in 2.0 becomes the x-nullable extension — the 2.0 schema object admits nothing else');
const nul30 = nullableByVersion({ openapi: '3.0.3' }, 'components');
assert(nul30.nullable === true && JSON.stringify(nul30.type) === '"string"',
  '[nullable] in 3.0 sets the nullable keyword and leaves the type alone');
for (const v of ['3.1.0', '3.2.0']) {
  const n = nullableByVersion({ openapi: v }, 'components');
  assert(JSON.stringify(n.type) === '["string","null"]' && n.nullable === undefined,
    '[nullable] in ' + v + ' states null in the type — the keyword was removed in 3.1');
}
const nulNoType = (() => {
  const spec = { openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {},
    components: { schemas: { P: { type: 'object', properties: { a: { description: '[nullable]' } } } } } };
  applyMarkers(spec);
  return spec.components.schemas.P.properties.a;
})();
assert(nulNoType.type === 'null', '3.1 with no declared type: null becomes the type');

console.log('example-fill-test OK');
