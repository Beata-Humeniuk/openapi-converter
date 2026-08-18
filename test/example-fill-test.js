const {
  applyMarkers, liftDescriptionTags,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
} = require('../src/exampleFill');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const s1 = scanTags('Numer wniosku. [example: WN/2026/000123]');
assert(s1.length === 1 && s1[0].key === 'example' && s1[0].raw === 'WN/2026/000123', 'tag with a value is read');
const s2 = scanTags('Pole. [deprecated] [format: uuid]');
assert(s2.length === 2 && s2[0].raw === undefined && s2[1].raw === 'uuid', 'valueless flag + tag with a value');
assert(scanTags('[example: {"a": [1, 2]}]')[0].raw === '{"a": [1, 2]}', 'balanced brackets in JSON');
assert(scanTags('[example: niedomknięty').length === 0, 'unclosed tag is ignored');
assert(scanTags('liczność [0..1] w opisie').length === 0, 'non-tag brackets ([0..1]) do not match');
assert(exampleTagValue({ type: 'string', description: '[example: 0012]' }) === '0012', 'a string stays a string');
assert(exampleTagValue({ type: 'integer', description: '[EXAMPLE: 42]' }) === 42, 'integer + case does not matter');
assert(exampleTagValue({ type: 'boolean', description: '[example: true]' }) === true, 'boolean: true');
assert(exampleTagValue({ type: 'boolean', description: '[example: FALSE]' }) === false, 'boolean: case does not matter');
assert(exampleTagValue({ type: 'boolean', description: '[example: tak]' }) === undefined,
  'on a boolean field only true/false match — not yes/no words from any language');
assert(exampleTagValue({ type: 'boolean', description: '[example: 1]' }) === undefined, 'a number is not a boolean value');
assert(exampleTagValue({ type: 'number', description: '[example: 0.5]' }) === 0.5, 'number with a decimal point');
assert(exampleTagValue({ type: 'number', description: '[example: 0,5]' }) === undefined,
  'a decimal comma is not valid file notation — the marker stays in the description');
assert(exampleTagValue({ type: 'string', description: '[exmaple: X]' }) === undefined, 'a typo is NOT matched');
assert(exampleTagValue({ type: 'string', description: 'example: X bez nawiasów' }) === undefined, 'without brackets it does not match');
assert(defaultTagValue({ type: 'string', description: '[default: PLN]' }) === 'PLN', 'default tag');
assert(coerceValue('"007"', 'string') === '007', 'quotes are stripped for string');
assert(stripDescriptionTags('opis [example: X] dalszy ciąg') === 'opis dalszy ciąg', 'strip keeps the rest of the description');
assert(stripDescriptionTags('opis [TODO: sprawdzić] reszta') === 'opis [TODO: sprawdzić] reszta', 'strip leaves unknown tags alone');

const uniSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: {
    schemas: {
      Pole: {
        type: 'object',
        properties: {
          kod: {
            type: 'string',
            description: 'Kod produktu. [format: uuid] [minLength: 3] [maxLength: 36] [deprecated] [TODO: do przeglądu]'
          },
          rodzaj: { type: 'string', description: '[enum: A, B, C]' },
          licznik: { type: 'integer', description: '[minimum: 10] [multipleOf: 5]' },
          stary: { type: 'string', description: '[nullable] [readOnly] [x-team: ZPL]' },
          zly: { type: 'string', description: '[minLength: abc]' }
        }
      }
    }
  }
};
liftDescriptionTags(uniSpec);
const U = uniSpec.components.schemas.Pole.properties;
assert(U.kod.format === 'uuid' && U.kod.minLength === 3 && U.kod.maxLength === 36, 'format/minLength/maxLength from tags');
assert(U.kod.deprecated === true, 'valueless [deprecated] flag');
assert(U.kod.description === 'Kod produktu. [TODO: do przeglądu]', 'unknown tag stays in the description, known ones disappear');
assert(JSON.stringify(U.rodzaj.enum) === '["A","B","C"]', '[enum:] with a comma-separated list');
assert(U.licznik.minimum === 10 && U.licznik.multipleOf === 5, 'numeric fields are coerced');
assert(U.stary.nullable === true && U.stary.readOnly === true, 'nullable/readOnly in 3.x');
assert(U.stary['x-team'] === 'ZPL', '[x-...] is carried over as a vendor extension');
assert(U.zly.minLength === undefined && U.zly.description === '[minLength: abc]',
  'a value of the wrong type is NOT written — the tag remains visible in the description');

const uniSpec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {},
  definitions: {
    P: { type: 'object', properties: {
      opc: { type: 'string', description: '[nullable]' },
      prio: { type: 'integer', description: '[enum: 1, 2, 3]' }
    } }
  }
};
liftDescriptionTags(uniSpec2);
assert(uniSpec2.definitions.P.properties.opc['x-nullable'] === true, 'Swagger2: [nullable] → x-nullable');
assert(JSON.stringify(uniSpec2.definitions.P.properties.prio.enum) === '[1,2,3]', 'enum coerced to integer type');

const nothingSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: { X: { type: 'object', properties: {
    zEnumem:       { type: 'string', enum: ['A', 'B'] },
    zFormatem:     { type: 'string', format: 'date' },
    zWzorcem:      { type: 'string', pattern: '^\\d{3}$' },
    zDefault:      { type: 'string', default: 'PLN' },
    imie:          { type: 'string' },
    liczba:        { type: 'integer', minimum: 5 },
    flaga:         { type: 'boolean' },
    zeZnacznikiem: { type: 'string', description: '[example: "WWW"]' },
    juzUstawione:  { type: 'string', example: 'z modelu' }
  } } }
};
const nothingStats = applyMarkers(nothingSpec);
const NX = nothingSpec.definitions.X.properties;
for (const puste of ['zEnumem', 'zFormatem', 'zWzorcem', 'zDefault', 'imie', 'liczba', 'flaga']) {
  assert(NX[puste].example === undefined, puste + ': gets no example without a marker');
}
assert(NX.zEnumem.enum.length === 2 && NX.zDefault.default === 'PLN', 'the model stays untouched');
assert(NX.zeZnacznikiem.example === 'WWW', 'example from the marker is set');
assert(NX.juzUstawione.example === 'z modelu', 'a value already present in the model stays');
assert(nothingStats.examplesAdded === 1, 'exactly one added example is counted');

const spec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/wnioski/{id}': {
      get: {
        operationId: 'getWniosek',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Wniosek' } } } } }
      }
    }
  },
  components: {
    schemas: {
      Wniosek: {
        type: 'object',
        required: ['numer'],
        properties: {
          numer: { type: 'string', description: 'Numer wniosku. [example: WN/2026/000123]' },
          status: { type: 'string', enum: ['NOWY', 'ZATWIERDZONY'] },
          kwota: { type: 'number', minimum: 0.01 },
          waluta: { type: 'string', description: 'Waluta. [default: PLN]' },
          zalaczniki: { type: 'array', items: { type: 'string', format: 'uri' } },
          klient: { $ref: '#/components/schemas/Klient' },
          gotowy: { type: 'string', example: 'zostaje' }
        }
      },
      Klient: {
        type: 'object',
        properties: {
          imie: { type: 'string' },
          pesel: { type: 'string', pattern: '^\\d{11}$' },
          tajemniczy: { type: 'string', pattern: '^(?!x)y$' }
        }
      }
    }
  }
};
const stats3 = applyMarkers(spec3);
const P = spec3.components.schemas.Wniosek.properties;
const K = spec3.components.schemas.Klient.properties;
assert(P.numer.example === 'WN/2026/000123', 'example from the [example:] tag');
assert(P.numer.description === 'Numer wniosku.', 'tag removed from the description after being applied');
assert(P.status.example === undefined, 'enum does NOT produce an example — that is what Swagger UI is for');
assert(P.kwota.example === undefined, 'a numeric constraint does not either');
assert(P.waluta.default === 'PLN', 'default from the [default:] tag');
assert(P.waluta.example === undefined, 'default sets default, not example');
assert(stats3.fromTags === 1 && stats3.defaultsAdded === 1, 'tag counters');
assert(P.zalaczniki.items.example === undefined, 'format on items does not generate either');
assert(P.gotowy.example === 'zostaje', 'existing example untouched');
assert(P.klient.example === undefined, 'object referenced via $ref gets no example');
assert(K.imie.example === undefined, 'no name-based heuristics');
assert(K.pesel.example === undefined, 'a pattern does not generate a value');
const paramSchema = spec3.paths['/wnioski/{id}'].get.parameters[0].schema;
assert(paramSchema.example === undefined, 'a parameter without a marker stays without an example');

const snapshot = JSON.stringify(spec3);
const stats3b = applyMarkers(spec3);
assert(stats3b.examplesAdded === 0, 'second pass adds nothing');
assert(JSON.stringify(spec3) === snapshot, 'second pass does not change the file');

const spec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/klienci': {
      get: {
        parameters: [
          { name: 'pesel', in: 'query', type: 'string', pattern: '^\\d{11}$' },
          { name: 'strona', in: 'query', type: 'integer', minimum: 1 },
          { name: 'body', in: 'body', schema: { $ref: '#/definitions/Filtr' } }
        ],
        responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Klient' } } }
      }
    }
  },
  definitions: {
    Filtr: { type: 'object', properties: { miasto: { type: 'string' } } },
    Klient: { type: 'object', properties: { nazwisko: { type: 'string' } } }
  }
};
applyMarkers(spec2);
const params = spec2.paths['/klienci'].get.parameters;
assert(params[0]['x-example'] === undefined, 'Swagger2 param without a marker stays empty');
assert(spec2.definitions.Filtr.properties.miasto.example === undefined, 'fields in definitions are not filled either');

spec2.paths['/klienci'].get.parameters[0].description = 'PESEL [example: "90010112345"]';
spec2.definitions.Filtr.properties.miasto.description = '[example: "Warszawa"]';
applyMarkers(spec2);
assert(params[0]['x-example'] === '90010112345', 'Swagger2 query param with a marker → x-example');
assert(spec2.definitions.Filtr.properties.miasto.example === 'Warszawa', 'field in definitions with a marker');

const specConv = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/x': {
      get: {
        parameters: [{ name: 'kanal', in: 'query', type: 'string', description: 'Kanał. [example: WWW]' }],
        responses: { '200': { description: 'OK', schema: { $ref: '#/definitions/Odp' } } }
      }
    }
  },
  definitions: {
    Odp: {
      type: 'object',
      properties: {
        kod: { type: 'string', description: '[example: OK00] [default: OK00]' },
        bezTagu: { type: 'string' }
      }
    }
  }
};
const liftStats = liftDescriptionTags(specConv);
const O = specConv.definitions.Odp.properties;
assert(O.kod.example === 'OK00' && O.kod.default === 'OK00', 'lift applies both tags');
assert(O.kod.description === undefined, 'a description left empty after tags is removed entirely');
assert(O.bezTagu.example === undefined, 'lift does NOT run the generator');
assert(specConv.paths['/x'].get.parameters[0]['x-example'] === 'WWW', 'lift: Swagger2 param → x-example');
assert(specConv.paths['/x'].get.parameters[0].description === 'Kanał.', 'lift cleans the parameter description');
assert(liftStats.examplesAdded === 2 && liftStats.defaultsAdded === 1, 'lift counters');

const specMedia2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/upload': {
      post: {
        description: 'Wysyłka pliku.\n[consumes: multipart/form-data]\n[produces: application/json, application/xml]',
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
assert(opUp.description === 'Wysyłka pliku.', 'media tags removed from the operation description');
assert(mediaStats2.mediaSet === 2, 'mediaSet counter');

const specOpTags = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: {
    '/stare': {
      get: {
        description: 'Stara operacja.\n[operationId: getStare] [tags: Płatności, Archiwum] [deprecated]',
        responses: { '200': { description: 'OK' } }
      }
    }
  }
};
liftDescriptionTags(specOpTags);
const opStare = specOpTags.paths['/stare'].get;
assert(opStare.operationId === 'getStare', '[operationId:] on an operation');
assert(JSON.stringify(opStare.tags) === '["Płatności","Archiwum"]', '[tags:] with a comma-separated list');
assert(opStare.deprecated === true, '[deprecated] on an operation');
assert(opStare.description === 'Stara operacja.', 'tags removed from the operation description');

const specFmt = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { X: { type: 'object', properties: {
    od: { type: 'string', description: 'Data początku. [format: date]' }
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
    '/dok': {
      post: {
        description: '[consumes: application/xml] [produces: application/xml, application/json]',
        requestBody: { content: { 'application/json': { schema: { type: 'string' } } } },
        responses: {
          '200': { description: 'OK', content: { 'application/json': { schema: { type: 'integer' } } } },
          '500': { description: 'Błąd' }
        }
      }
    }
  }
};
liftDescriptionTags(specMedia3);
const opDok = specMedia3.paths['/dok'].post;
assert(Object.keys(opDok.requestBody.content).join() === 'application/xml', '3.x: consumes re-keys requestBody.content');
assert(opDok.requestBody.content['application/xml'].schema.type === 'string', '3.x: request schema preserved');
assert(Object.keys(opDok.responses['200'].content).join() === 'application/xml,application/json', '3.x: produces re-keys the response content');
assert(opDok.responses['200'].content['application/json'].schema.type === 'integer', '3.x: response schema preserved');
assert(opDok.responses['500'].content === undefined, '3.x: a response without content is untouched');
assert(opDok.description === undefined, '3.x: a description left empty after tags is removed');

const specNull = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { X: { type: 'object', properties: {
    imie: { type: 'string', example: null },
    kwota: { type: 'number', default: null, minimum: 5 },
    zTagiem: { type: 'string', example: null, description: '[example: WN/1]' },
    jawny: { type: 'string', example: 'zostaje' }
  } } } }
};
const nullStats = applyMarkers(specNull);
const N = specNull.components.schemas.X.properties;
assert(N.imie.example === null, 'an explicit null stays null — nothing replaces it');
assert(N.kwota.example === undefined, 'a field without a marker stays without an example');
assert(N.zTagiem.example === 'WN/1', 'the [example:] tag overrides an explicit null');
assert(N.jawny.example === 'zostaje', 'a value from the model is untouched');
assert(nullStats.examplesAdded === 1, 'only the example from the marker is counted');

const specRefTag = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: {
    IdentityNumber: {
      type: 'object',
      properties: {
        value: { $ref: '#/components/schemas/TypedValue', description: '[example: 0932151033]' },
        type: { $ref: '#/components/schemas/TypedValue', description: '[example: 1]' }
      }
    },

    TypedValue: { type: 'string' }
  } }
};
const refTagStats = applyMarkers(specRefTag);
const R = specRefTag.components.schemas.IdentityNumber.properties;
assert(R.value.example === '0932151033', 'an [example:] tag on a $ref field (next to the reference) ends up in example');
assert(R.type.example === '1', 'same for the second $ref field in the same object');
assert(R.value.description === undefined, 'tag removed from the description after being applied — idempotence');
assert(specRefTag.components.schemas.TypedValue.example === undefined,
  'a shared type without a marker stays without an example');
assert(R.value.example === '0932151033' && R.type.example === '1',
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
    kod: { type: 'string', description: '[example: null]' },
    lista: { type: 'array', items: { type: 'string' }, description: '[example: null]' },
    pusta: { type: 'array', items: { type: 'string' }, description: '[example: []]' },
    tekstNull: { type: 'string', description: '[example: "null"]' }
  } } } }
};
applyMarkers(nullSpec);
const NS = nullSpec.components.schemas.X.properties;
assert(NS.kod.example === null, 'scalar: the [example: null] tag survives the same pass — the generator does not overwrite it');
assert(NS.lista.example === null, 'array: [example: null] stays a real null, not [null] nor a generated array');
assert(Array.isArray(NS.pusta.example) && NS.pusta.example.length === 0, '[example: []] yields an empty array');
assert(NS.tekstNull.example === 'null', 'a quoted [example: "null"] yields literal text, not JS null');

const listSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { D: { type: 'object', properties: {

    metody: { type: 'array', items: { type: 'string', description: 'Dostępne sposoby [example: ["RQST","MAIL"]]' } },

    kanaly: { type: 'array', items: { type: 'string' }, description: 'Lista [example: ["WWW"]]' },

    jeden: { type: 'array', items: { type: 'string' }, description: '[example: RQST]' },

    element: { type: 'array', items: { type: 'string', description: '[example: RQST]' } },

    kody: { type: 'array', items: { type: 'integer', description: '[example: [1,2]]' } },

    typy: { type: 'array', items: { $ref: '#/components/schemas/Kod', description: '[example: ["A"]]' } },

    macierz: { type: 'array', items: { type: 'array', items: { type: 'integer' }, description: '[example: [1,2]]' } },

    zWzorcem: { type: 'array', items: { type: 'string', description: '[example: ["AB"]] [pattern: ^[A-Z]{2}$]' } }
  } }, Kod: { type: 'string' } } }
};
applyMarkers(listSpec);
const L = listSpec.components.schemas.D.properties;
const eq = (v, s) => JSON.stringify(v) === s;
assert(eq(L.metody.example, '["RQST","MAIL"]'), 'a list from the item note lands on the array');
assert(L.metody.items.example === undefined, 'the item does not get the list as its own example');
assert(L.metody.items.description === 'Dostępne sposoby', 'tag removed from the item description');
assert(eq(L.kanaly.example, '["WWW"]'), 'a list from the array note stays on the array');
assert(eq(L.jeden.example, '["RQST"]'), 'a single value on the array is wrapped in a one-element list');
assert(L.element.items.example === 'RQST' && L.element.example === undefined, 'a single value on the item stays on the item');
assert(eq(L.kody.example, '[1,2]') && L.kody.items.example === undefined, 'a list of numbers lands on the array');
assert(eq(L.typy.example, '["A"]') && listSpec.components.schemas.Kod.example === undefined,
  '$ref item: example on the array, the shared type untouched');
assert(eq(L.macierz.items.example, '[1,2]') && L.macierz.example === undefined,
  'list of lists: the array value stays on the item, which is itself an array');
assert(eq(L.zWzorcem.example, '["AB"]') && L.zWzorcem.items.pattern === '^[A-Z]{2}$',
  'pattern describes the item and stays on it, the example goes onto the array');
assert(L.zWzorcem.items.example === undefined,
  'an item without its own marker stays without an example');

const listSnapshot = JSON.stringify(listSpec);
applyMarkers(listSpec);
assert(JSON.stringify(listSpec) === listSnapshot, 'arrays: second pass is idempotent');

const fitSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { L: { type: 'object', properties: {
    amount: { type: 'number', description: 'Kwota limitu [pattern: ^\\d+\\.\\d{2}$] [example: 5000.00]' },
    licznik: { type: 'integer', description: '[minLength: 3]' },
    tekst: { type: 'string', description: '[minimum: 1]' },
    tekst2: { type: 'string', description: '[uniqueItems]' },
    zepsuty: { type: 'string', description: '[pattern: ^(]' },
    dobry: { type: 'string', description: '[pattern: ^[A-Z]{2}$]' },
    lista: { type: 'array', items: { type: 'string' }, description: '[minItems: 1] [uniqueItems]' },
    obiekt: { type: 'object', properties: {}, description: '[minProperties: 1]' }
  } } } }
};
const fitStats = applyMarkers(fitSpec);
const F = fitSpec.components.schemas.L.properties;
assert(F.amount.pattern === undefined, '[pattern:] does not land on a numeric field');
assert(/\[pattern:/.test(F.amount.description), 'a non-matching [pattern:] stays in the description, visible');
assert(F.amount.example === 5000, 'the example from the same note still works (JSON does not know 5000.00)');
assert(F.licznik.minLength === undefined && /\[minLength:/.test(F.licznik.description), '[minLength:] only on a string');
assert(F.tekst.minimum === undefined && /\[minimum:/.test(F.tekst.description), '[minimum:] only on a number');
assert(F.tekst2.uniqueItems === undefined, '[uniqueItems] only on an array');
assert(F.zepsuty.pattern === undefined && /\[pattern:/.test(F.zepsuty.description), 'an invalid regex is not written');
assert(F.dobry.pattern === '^[A-Z]{2}$', 'a valid [pattern:] on a string still works');
assert(F.lista.minItems === 1 && F.lista.uniqueItems === true, 'array fields work on an array');
assert(F.obiekt.minProperties === 1, 'object fields work on an object');

const mismatchSpec = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: {},
  components: { schemas: { M: { type: 'object', properties: {
    zle: { type: 'string', description: 'Kwota [pattern: ^\\\\d+\\\\.\\\\d{2}$] [example: 5000.00]' },
    dobrze: { type: 'string', description: 'Kwota [pattern: ^\\d+\\.\\d{2}$] [example: 5000.00]' },
    zModelu: { type: 'string', pattern: '^[A-Z]{2}$', example: 'abc' }
  } } } }
};
const mismatchStats = applyMarkers(mismatchSpec);
assert(mismatchStats.mismatched.indexOf('M.zle') >= 0, 'doubled backslashes caught as an example/pattern mismatch');
assert(mismatchStats.mismatched.indexOf('M.dobrze') < 0, 'a correct pattern is not reported');
assert(mismatchStats.mismatched.indexOf('M.zModelu') >= 0, 'a mismatch straight from the model (no markers) is seen too');

const quoteSpec = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: { '/x': { get: {
    description: 'Coś. [operationId: getX] [tags: "Umowy, Karty", "Płatności"]',
    responses: { '200': { description: 'OK' } }
  } } },
  definitions: { Q: { type: 'object', properties: {
    kod: { type: 'string', description: '[example: "0012"]' },
    zNawiasem: { type: 'string', description: 'Uwaga [example: "a]b, c"] koniec' },
    zeSpacja: { type: 'string', description: '[example: "  wcięcie  "]' },
    wzorzec: { type: 'string', description: '[pattern: "^[A-Z]{2}$"] [example: "AB"]' },
    listaZPrzecinkiem: { type: 'array', items: { type: 'string', description: '[example: ["A,B", "C"]]' } },
    enumZPrzecinkiem: { type: 'string', description: '[enum: "A,B", "C"]' },
    kwota: { type: 'number', description: 'Kwota [example: "5000.00"]' },
    flaga: { type: 'boolean', description: '[example: "true"]' },
    enumLiczb: { type: 'integer', description: '[enum: "1", "2"]' }
  } } }
};
const quoteStats = applyMarkers(quoteSpec);
const Q = quoteSpec.definitions.Q.properties;
assert(Q.kod.example === '0012', 'quoted text stays text');
assert(Q.zNawiasem.example === 'a]b, c', 'quotes protect ] and , inside the value');
assert(Q.zNawiasem.description === 'Uwaga koniec', 'the quoted tag is removed in full');
assert(Q.zeSpacja.example === '  wcięcie  ', 'quotes preserve leading and trailing spaces');
assert(Q.wzorzec.pattern === '^[A-Z]{2}$' && Q.wzorzec.example === 'AB', 'a quoted pattern works');
assert(JSON.stringify(Q.listaZPrzecinkiem.example) === '["A,B","C"]', 'a comma inside quotes does not split the list');
assert(JSON.stringify(Q.enumZPrzecinkiem.enum) === '["A,B","C"]', 'same in a comma-separated enum');
assert(Q.kwota.example === undefined && /\[example:/.test(Q.kwota.description),
  'quotes do not fit a numeric field — the marker stays in the description');
assert(Q.flaga.example === undefined, 'same on a boolean field');
assert(Q.enumLiczb.enum === undefined && /\[enum:/.test(Q.enumLiczb.description),
  'a quoted enum of numbers: the whole marker stays, not half the list');
assert(JSON.stringify(quoteSpec.paths['/x'].get.tags) === '["Umowy, Karty","Płatności"]',
  'operation tag list: a comma inside quotes belongs to the value');
assert(quoteStats.tagFields > 0, 'quoted markers were counted');

const quotedKinds = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: { '/y': { post: {
    description: 'Coś. [operationId: "createAgreement"] [summary: "Założenie umowy"] [tags: "Umowy", "Płatności"] [consumes: "application/json", "application/xml"] [produces: "application/json"] [x-source: "EA"]',
    responses: { '200': { description: 'OK' } }
  } } },
  definitions: { K: { type: 'object', properties: {
    data: { type: 'string', description: '[format: "date"] [example: "2026-03-01"]' },
    czas: { type: 'string', description: '[format: "date-time"] [example: "2026-01-01T12:00:00Z"]' },
    uid: { type: 'string', description: '[format: "uuid"] [example: "3f2504e0-4f89-41d3-9a0c-0305e82c3301"]' },
    status: { type: 'string', description: '[enum: "ACTIVE", "CLOSED"] [default: "ACTIVE"]' },
    enumJson: { type: 'string', description: '[enum: ["A", "B"]] [example: "A"]' },
    tytul: { type: 'string', description: '[title: "Numer umowy"]' }
  } } }
};
applyMarkers(quotedKinds);
const QK = quotedKinds.definitions.K.properties;
const quotedOp = quotedKinds.paths['/y'].post;
assert(QK.data.format === 'date' && QK.data.example === '2026-03-01', 'quoted date');
assert(QK.czas.example === '2026-01-01T12:00:00Z', 'quoted date-time');
assert(QK.uid.format === 'uuid' && QK.uid.example === '3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'quoted uid');
assert(JSON.stringify(QK.status.enum) === '["ACTIVE","CLOSED"]' && QK.status.default === 'ACTIVE', 'quoted enum values and default');
assert(JSON.stringify(QK.enumJson.enum) === '["A","B"]', 'enum written as a JSON array');
assert(QK.tytul.title === 'Numer umowy', 'quoted title');
assert(quotedOp.operationId === 'createAgreement' && quotedOp.summary === 'Założenie umowy', 'quoted operation fields');
assert(JSON.stringify(quotedOp.consumes) === '["application/json","application/xml"]', 'quoted consumes');
assert(JSON.stringify(quotedOp.produces) === '["application/json"]', 'quoted produces');
assert(quotedOp['x-source'] === 'EA', 'quoted vendor extension');

const summarySpec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  paths: { '/a': { post: {
    summary: 'Założenie umowy [consumes: "application/json", "application/xml"] [produces: "application/xml"]',
    description: 'Zakłada umowę. [operationId: "createAgreement"] [tags: "Umowy"]',
    responses: { '200': { description: 'OK' } }
  } } }
};
const summaryStats = liftDescriptionTags(summarySpec2);
const sop = summarySpec2.paths['/a'].post;
assert(JSON.stringify(sop.consumes) === '["application/json","application/xml"]', 'consumes from a marker in summary');
assert(JSON.stringify(sop.produces) === '["application/xml"]', 'produces from a marker in summary');
assert(sop.summary === 'Założenie umowy', 'marker removed from summary, the content stays');
assert(sop.operationId === 'createAgreement' && JSON.stringify(sop.tags) === '["Umowy"]', 'description still works alongside summary');
assert(summaryStats.mediaSet === 2, 'both media types counted');

const summarySpec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/a': { post: {
    summary: 'Założenie umowy [consumes: "application/xml"] [produces: "application/xml"]',
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } }
  } } }
};
liftDescriptionTags(summarySpec3);
const sop3 = summarySpec3.paths['/a'].post;
assert(Object.keys(sop3.requestBody.content)[0] === 'application/xml', '3.x: consumes from summary re-keys requestBody');
assert(Object.keys(sop3.responses['200'].content)[0] === 'application/xml', '3.x: produces from summary re-keys the response');
assert(sop3.summary === 'Założenie umowy', '3.x: summary cleaned up');

const selfSummary = { swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/b': { get: { summary: 'stara treść [summary: "Odczyt umowy"]', responses: {} } } } };
liftDescriptionTags(selfSummary);
assert(selfSummary.paths['/b'].get.summary === 'Odczyt umowy', '[summary:] inside summary overwrites the content, does not vanish');

const onlyTag = { swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/c': { get: { summary: '[produces: "application/json"]', responses: {} } } } };
liftDescriptionTags(onlyTag);
assert(onlyTag.paths['/c'].get.summary === undefined, 'an empty summary is removed, does not stay ""');
assert(JSON.stringify(onlyTag.paths['/c'].get.produces) === '["application/json"]', 'the value from the marker is applied');

const plainSummary = { swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/d': { get: { summary: 'Zwykły tytuł operacji', description: 'opis [tags: "A"]', responses: {} } } } };
liftDescriptionTags(plainSummary);
assert(plainSummary.paths['/d'].get.summary === 'Zwykły tytuł operacji', 'a summary without markers is untouched');

const q = (raw, type) => exampleTagValue({ type: type || 'string', description: 'Opis [example: ' + raw + '] koniec' });
assert(q('""') === '', 'an empty quoted string');
assert(q('"on powiedział \\"tak\\""') === 'on powiedział "tak"', 'a quote inside the content, JSON-style (\\")');
assert(q('"pole \\"kod\\" i \\"typ\\""') === 'pole "kod" i "typ"', 'several quotes inside the content');
assert(q('"\\""') === '"', 'a lone quote as the whole value');
assert(q('"a\\\\b"') === 'a\\b', 'a double backslash inside quotes is one backslash, as in JSON');
assert(q('"pierwsza\\ndruga"') === 'pierwsza\\ndruga', 'other escapes stay literal — \\n is not a newline');
assert(q('"C:\\raporty"') === 'C:\\raporty', 'a path with a backslash stays a path (JSON would turn \\r into a carriage return)');
assert(q('"5" cala"') === '5" cala', 'an unbalanced quote: the marker is still read, the content taken literally');
assert(q('"a]b, c"') === 'a]b, c', 'bracket and comma inside quotes are still protected');

const escSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/x': { get: { description: 'op [summary: "raport \\"dzienny\\""]', responses: {} } } },
  definitions: { E: { type: 'object', properties: {
    wzorzec: { type: 'string', description: '[pattern: "^\\\\d+$"] [example: "12345"]' },
    doslownie: { type: 'string', description: '[pattern: ^\\\\d+$] [example: "12345"]' },
    tytul: { type: 'string', description: '[title: "pole \\"kod\\""]' },
    lista: { type: 'string', description: '[enum: "a\\"b", "c"]' }
  } } }
};
const escStats = applyMarkers(escSpec);
const E = escSpec.definitions.E.properties;
assert(escSpec.paths['/x'].get.summary === 'raport "dzienny"', 'a quote inside summary content');
assert(E.wzorzec.pattern === '^\\d+$', 'inside quotes \\\\d is one backslash — a valid digits pattern');
assert(escStats.mismatched.indexOf('E.wzorzec') < 0, 'a correct pattern is not reported');
assert(E.doslownie.pattern === '^\\\\d+$', 'without quotes the content is literal — the double backslash stays');
assert(escStats.mismatched.indexOf('E.doslownie') >= 0, 'the literal double backslash does not match the example and is reported');
assert(E.tytul.title === 'pole "kod"', 'a quote inside title content');
assert(JSON.stringify(E.lista.enum) === '["a\\"b","c"]', 'a quote inside an enum value');

const refSpec = (root) => Object.assign({ info: { title: 'T', version: '1' }, paths: {}, definitions: {
  Umowa: { type: 'object', properties: {
    kwota: { $ref: '#/definitions/Shared_Amount', description: 'Kwota limitu [example: "5000.00"] [format: "decimal"]' },
    bezZnacznika: { $ref: '#/definitions/Shared_Amount' }
  } },
  Shared_Amount: { type: 'string', description: 'Wspólny typ' }
} }, root);

const ref2 = refSpec({ swagger: '2.0' });
const ref2Stats = applyMarkers(ref2);
const R2 = ref2.definitions.Umowa.properties;
assert(R2.kwota.$ref === undefined, '2.0: bare $ref replaced by the wrapper');
assert(JSON.stringify(R2.kwota.allOf) === '[{"$ref":"#/definitions/Shared_Amount"}]', '2.0: reference preserved inside allOf');
assert(R2.kwota.example === '5000.00' && R2.kwota.format === 'decimal', '2.0: values from the note next to allOf');
assert(R2.kwota.description === 'Kwota limitu', '2.0: the description stays on the wrapper, where it takes effect');
assert(ref2Stats.refsWrapped === 1, 'the wrap counted in the report');
assert(R2.bezZnacznika.$ref === '#/definitions/Shared_Amount' && R2.bezZnacznika.allOf === undefined,
  'a field without a marker is not touched');
assert(JSON.stringify(ref2.definitions.Shared_Amount) === JSON.stringify({ type: 'string', description: 'Wspólny typ' }),
  'the shared type is untouched — that is the whole point of this exercise');

const ref30 = refSpec({ openapi: '3.0.3' });
applyMarkers(ref30);
assert(ref30.definitions.Umowa.properties.kwota.allOf !== undefined, '3.0: same as in 2.0');

const ref31 = refSpec({ openapi: '3.1.0' });
const ref31Stats = applyMarkers(ref31);
const R31 = ref31.definitions.Umowa.properties;
assert(R31.kwota.$ref === '#/definitions/Shared_Amount' && R31.kwota.allOf === undefined,
  '3.1: siblings of $ref are legal, so the structure is left alone');
assert(R31.kwota.example === '5000.00', '3.1: value next to the reference');
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
    Umowa: { type: 'object', properties: {
      zWlasnym: { $ref: '#/definitions/Shared_Amount', description: 'Kwota limitu [example: "5000.00"]' },
      bezWlasnego: { $ref: '#/definitions/Shared_Amount', description: 'Inna kwota, bez własnego przykładu' }
    } },
    Shared_Amount: { type: 'string', description: 'Wspólny typ [example: "0.00"]' }
  }
};
applyMarkers(precSpec);
const D = precSpec.definitions;
assert(effectiveExample(D.Umowa.properties.zWlasnym, D) === '5000.00',
  'a field with its own marker shows ITS OWN example, not the shared type\'s');
assert(effectiveExample(D.Umowa.properties.bezWlasnego, D) === '0.00',
  'a field without its own marker falls back to the shared type\'s example');
assert(D.Shared_Amount.example === '0.00', 'the shared type keeps its example for the remaining usages');
assert(D.Umowa.properties.zWlasnym.allOf !== undefined,
  'this wrapper is what makes the field\'s own example visible at all');

const prec31Spec = {
  openapi: '3.1.0', info: { title: 'T', version: '1' }, paths: {},
  components: { schemas: {
    Umowa: { type: 'object', properties: {
      zWlasnym: { $ref: '#/components/schemas/Shared_Amount', description: 'Kwota [example: "5000.00"]' },
      bezWlasnego: { $ref: '#/components/schemas/Shared_Amount' }
    } },
    Shared_Amount: { type: 'string', description: '[example: "0.00"]' }
  } }
};
applyMarkers(prec31Spec);
const S31 = prec31Spec.components.schemas;
assert(effectiveExample(S31.Umowa.properties.zWlasnym, S31) === '5000.00', '3.1: the field\'s own example wins');
assert(effectiveExample(S31.Umowa.properties.bezWlasnego, S31) === '0.00', '3.1: no own example → the type\'s example');

const spreadSpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: {
    Wniosek: { type: 'object', properties: {
      details: { $ref: '#/definitions/Shared_Details', description: 'Szczegóły [exampleBody: {"channel": "MAIL", "portfolio": "260", "limit": {"amount": "1000.00"}, "tags": ["A", "B"], "literowka": 1}]' },
      caly:    { $ref: '#/definitions/Shared_Details', description: 'Całość [example: {"channel": "SMS"}]' },
      rows:    { type: 'array', items: { $ref: '#/definitions/Shared_Row' }, description: 'Wiersze [exampleBody: [{"role": "23", "allowed": true}]]' }
    } },
    Shared_Details: { type: 'object', properties: {
      channel:   { $ref: '#/definitions/Shared_Channel' },
      portfolio: { type: 'string' },
      limit:     { type: 'object', properties: { amount: { type: 'string' } } },
      tags:      { type: 'array', items: { type: 'string' } }
    } },
    Shared_Row: { type: 'object', properties: { role: { type: 'string' }, allowed: { type: 'boolean' } } },
    Shared_Channel: { type: 'string', description: '[enum: "RQST", "MAIL", "SMS"]' }
  }
};
const spreadStats = applyMarkers(spreadSpec);
const SD = spreadSpec.definitions;
assert(SD.Shared_Details.properties.portfolio.example === '260', '[exampleBody:] assigns the example to the field underneath');
assert(SD.Shared_Details.properties.channel.example === 'MAIL', 'a field typed with the shared type also gets its own example');
assert(SD.Shared_Details.properties.channel.allOf !== undefined, 'the $ref field is wrapped so the example is not dead');
assert(SD.Shared_Details.properties.limit.properties.amount.example === '1000.00', 'the spread descends into nested objects');
assert(JSON.stringify(SD.Shared_Details.properties.tags.example) === '["A","B"]', 'a list lands at the array field');
assert(JSON.stringify(SD.Wniosek.properties.details.example) ===
  '{"channel":"MAIL","portfolio":"260","limit":{"amount":"1000.00"},"tags":["A","B"]}',
  '[exampleBody:] also leaves the whole example on the field — without it the payload would show fields outside the note');
assert(spreadStats.unknownKeys.indexOf('literowka') >= 0, 'a key outside the model is reported, not inserted silently');
assert(SD.Shared_Details.properties.literowka === undefined, 'and indeed not added to the structure');

assert(JSON.stringify(SD.Wniosek.properties.caly.example) === '{"channel":"SMS"}', '[example:] still works the old way');

assert(SD.Shared_Row.properties.role.example === '23' && SD.Shared_Row.properties.allowed.example === true,
  '[exampleBody:] from an array spreads onto the item\'s fields');

const spreadSnapshot = JSON.stringify(spreadSpec);
applyMarkers(spreadSpec);
assert(JSON.stringify(spreadSpec) === spreadSnapshot, '[exampleBody:] is idempotent');

const badSpread = { swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: { X: { type: 'object', properties: { a: { type: 'string', description: '[exampleBody: cokolwiek]' } } } } };
applyMarkers(badSpread);
assert(/\[exampleBody:/.test(badSpread.definitions.X.properties.a.description), '[exampleBody:] without JSON stays visible in the description');

const bodySpec = {
  swagger: '2.0', info: { title: 'T', version: '1' }, paths: {},
  definitions: {
    W: { type: 'object', properties: {
      d: { $ref: '#/definitions/D', description: 'Szczegóły [exampleBody: {"a": "x", "c": {"d": 1}}]' },
      lista: { type: 'array', items: { $ref: '#/definitions/Row' }, description: 'Lista [exampleBody: {"role": "23"}]' },
      zlozony: { $ref: '#/definitions/Composed', description: 'Złożony [exampleBody: {"e": "y"}]' },
      skalar: { type: 'string', description: 'Skalar [exampleBody: {"a": 1}]' },
      zepsuty: { type: 'object', properties: { a: { type: 'string' } }, description: 'Zepsuty [exampleBody: {"a": 1,}]' }
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
assert(JSON.stringify(BW.lista.example) === '[{"role":"23"}]', 'an object written for a list describes one row');
assert(bodySpec.definitions.Row.properties.role.example === '23', 'and spreads onto the item\'s fields');
assert(bodySpec.definitions.Base.properties.e.example === 'y', 'a type composed with allOf is found too');
assert(bodyStats.notApplied.some((n) => /skalar/.test(n.path)), 'scalar: the marker is not applied and is reported');
assert(bodyStats.notApplied.some((n) => /zepsuty/.test(n.path) && /JSON/.test(n.reason)), 'broken JSON is reported with a reason');
assert(/\[exampleBody:/.test(BW.skalar.description), 'an unapplied marker stays visible in the description');

const bodySnapshot = JSON.stringify(bodySpec);
applyMarkers(bodySpec);
assert(JSON.stringify(bodySpec) === bodySnapshot, '[exampleBody:] is idempotent');

const respSpec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/wnioski': { get: {
    description: 'Odczyt wniosków. [response: 404 "Nie znaleziono wniosku" {"code": "NOT_FOUND"}] [response: 409] [response: 200 "OK — lista wniosków"] [response: 5XX "Błąd serwera"]',
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } }
  } } }
};
const respStats3 = applyMarkers(respSpec3);
const respOp3 = respSpec3.paths['/wnioski'].get;
assert(respOp3.responses['404'].description === 'Nie znaleziono wniosku', '[response:] adds a code with its description');
assert(JSON.stringify(respOp3.responses['404'].content['application/json'].example) === '{"code":"NOT_FOUND"}',
  '3.x: the JSON example lands in content, under the media type used by the other responses');
assert(respOp3.responses['409'].description === 'Conflict', 'a bare code gets the standard HTTP reason phrase');
assert(respOp3.responses['200'].description === 'OK — lista wniosków', 'an existing response only updates its description');
assert(respOp3.responses['200'].content['application/json'].schema.type === 'object', 'the existing content is untouched');
assert(respOp3.responses['5XX'].description === 'Błąd serwera', '3.x: a code range such as 5XX is allowed');
assert(respOp3.description === 'Odczyt wniosków.', 'response markers removed from the description');
assert(respStats3.responsesAdded === 3, 'three new responses counted (200 already existed)');
assert(respStats3.examplesAdded === 1, 'the response example is counted');

const respSnapshot3 = JSON.stringify(respSpec3);
applyMarkers(respSpec3);
assert(JSON.stringify(respSpec3) === respSnapshot3, '[response:] is idempotent');

const respSpec2 = {
  swagger: '2.0',
  info: { title: 'T', version: '1' },
  produces: ['application/json'],
  paths: { '/platnosci': { post: {
    produces: ['application/xml'],
    summary: 'Płatność [response: 500 {"error": "X"}] [response: 4XX] [response: default "Błąd ogólny"] [response: 403 Brak uprawnień]',
    responses: {}
  } } }
};
const respStats2 = applyMarkers(respSpec2);
const respOp2 = respSpec2.paths['/platnosci'].post;
assert(respOp2.responses['500'].description === 'Internal Server Error', 'Swagger2: default reason phrase');
assert(JSON.stringify(respOp2.responses['500'].examples['application/xml']) === '{"error":"X"}',
  'Swagger2: the example lands in examples under the operation produces type');
assert(respOp2.responses['default'].description === 'Błąd ogólny', 'the default response works');
assert(respOp2.responses['403'].description === 'Brak uprawnień', 'an unquoted description is accepted');
assert(respOp2.responses['4XX'] === undefined, 'Swagger2: a code range is NOT applied');
assert(/\[response: 4XX\]/.test(respOp2.summary), 'the rejected range marker stays visible in summary');
assert(respStats2.notApplied.some((n) => n.path === 'POST /platnosci' && /4XX/.test(n.reason)),
  'the rejected range is reported with the operation label');

const respMixed = {
  openapi: '3.1.0',
  info: { title: 'T', version: '1' },
  paths: { '/x': { get: {
    description: '[response: 410 Zasób usunięty {"gone": true}] [response: 999] [response: 404 "X" {zepsuty}] [response: 302]',
    responses: { '302': { $ref: '#/components/responses/Redirect' } }
  } } },
  components: { responses: { Redirect: { description: 'Przekierowanie' } } }
};
const respStatsMixed = applyMarkers(respMixed);
const respOpMixed = respMixed.paths['/x'].get;
assert(respOpMixed.responses['410'].description === 'Zasób usunięty', 'unquoted description followed by JSON: split correctly');
assert(respOpMixed.responses['410'].content['application/json'].example.gone === true,
  'the JSON tail after an unquoted description becomes the example');
assert(respOpMixed.responses['999'] === undefined && /\[response: 999\]/.test(respOpMixed.description),
  'an invalid status code stays in the description');
assert(respOpMixed.responses['404'] === undefined && /zepsuty/.test(respOpMixed.description),
  'broken JSON: the marker is not applied');
assert(respStatsMixed.notApplied.some((n) => /JSON/.test(n.reason)), 'broken JSON is reported with a reason');
assert(respOpMixed.responses['302'].$ref === '#/components/responses/Redirect',
  'a $ref response is untouched and the marker is reported');
assert(respStatsMixed.notApplied.some((n) => /\$ref/.test(n.reason)), '$ref response reported');

const respSchemaCheck3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/bledy': { get: {
    description: '[response: 404 {"code": "NOT_FOUND", "detale": {"pole": "id", "literowka": 1}, "zupelnieObce": true}] [response: 409 {"code": "CONFLICT"}]',
    responses: {
      '404': { description: 'stary opis', content: { 'application/json': { schema: { $ref: '#/components/schemas/Blad' } } } },
      '409': { description: 'Konflikt', content: { 'application/json': { schema: { $ref: '#/components/schemas/Blad' } } } }
    }
  } } },
  components: { schemas: {
    Blad: {
      type: 'object',
      properties: {
        code: { type: 'string' },
        detale: { type: 'object', properties: { pole: { type: 'string' } } }
      }
    }
  } }
};
const schemaCheckStats = applyMarkers(respSchemaCheck3);
const checkedOp = respSchemaCheck3.paths['/bledy'].get;
assert(checkedOp.responses['404'].content['application/json'].example.code === 'NOT_FOUND',
  'the example is applied even when some keys are unknown — like [exampleBody:]');
assert(schemaCheckStats.unknownKeys.indexOf('GET /bledy 404.zupelnieObce') >= 0,
  'a key outside the response schema is reported with the operation and code');
assert(schemaCheckStats.unknownKeys.indexOf('GET /bledy 404.detale.literowka') >= 0,
  'the check descends into nested objects');
assert(schemaCheckStats.unknownKeys.indexOf('GET /bledy 404.code') < 0 &&
  schemaCheckStats.unknownKeys.indexOf('GET /bledy 409.code') < 0,
  'keys present in the model are not reported');
assert(checkedOp.responses['404'].content['application/json'].example !== checkedOp.responses['409'].content['application/json'].example,
  'each code keeps its own example even though both share the Blad schema');
assert(respSchemaCheck3.components.schemas.Blad.properties.code.example === undefined,
  'the shared schema stays untouched — per-code examples live on the responses');

const respSchemaCheck2 = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/lista': { get: {
    description: '[response: 400 [{"powod": "X", "obcy": 1}]]',
    responses: { '400': { description: 'Błąd', schema: { type: 'array', items: { $ref: '#/definitions/Powod' } } } }
  } } },
  definitions: { Powod: { type: 'object', properties: { powod: { type: 'string' } } } }
};
const schemaCheckStats2 = applyMarkers(respSchemaCheck2);
assert(JSON.stringify(respSchemaCheck2.paths['/lista'].get.responses['400'].examples['application/json']) ===
  '[{"powod":"X","obcy":1}]', 'Swagger2: a list example lands in examples');
assert(schemaCheckStats2.unknownKeys.indexOf('GET /lista 400[].obcy') >= 0,
  'Swagger2: list items are checked against the item schema');
assert(schemaCheckStats2.unknownKeys.indexOf('GET /lista 400[].powod') < 0, 'Swagger2: a known item key is fine');

const respBodySpec3 = {
  openapi: '3.0.0',
  info: { title: 'T', version: '1' },
  paths: { '/zamowienia': { post: {
    description: 'Zamówienie. [response: 404 "Nie znaleziono" #Blad {"code": "NOT_FOUND", "zly": 1}] [response: 409 #/components/schemas/Blad] [response: 410 #Nieistnieje] [response: 422 {"code": "X"}]',
    responses: { '200': { description: 'OK', content: { 'application/xml': { schema: { type: 'object' } } } } }
  } } },
  components: { schemas: { Blad: { type: 'object', properties: { code: { type: 'string' } } } } }
};
const respBodyStats3 = applyMarkers(respBodySpec3);
const respBodyOp3 = respBodySpec3.paths['/zamowienia'].post;
assert(respBodyOp3.responses['404'].content['application/xml'].schema.$ref === '#/components/schemas/Blad',
  '3.x: #Blad becomes the body schema, under the media type the operation already uses');
assert(respBodyOp3.responses['404'].content['application/xml'].example.code === 'NOT_FOUND',
  'the example sits next to the body schema');
assert(respBodyStats3.unknownKeys.indexOf('POST /zamowienia 404.zly') >= 0,
  'the example is checked against the body schema given in the same marker');
assert(respBodyOp3.responses['404'].description === 'Nie znaleziono', 'description + schema + example in one marker');
assert(respBodyOp3.responses['409'].content['application/xml'].schema.$ref === '#/components/schemas/Blad',
  'a full JSON pointer also works, without an example');
assert(respBodyOp3.responses['409'].description === 'Conflict', 'schema-only marker still gets the reason phrase');
assert(respBodyOp3.responses['410'] === undefined && /#Nieistnieje/.test(respBodyOp3.description),
  'a schema that does not exist in the file: the marker stays visible');
assert(respBodyStats3.notApplied.some((n) => /Nieistnieje/.test(n.reason)), 'and is reported with a reason');
assert(respBodyOp3.responses['422'].content['application/xml'].schema === undefined,
  'a marker without # adds no schema — the example stands alone');

const respBodySnapshot3 = JSON.stringify(respBodySpec3);
applyMarkers(respBodySpec3);
assert(JSON.stringify(respBodySpec3) === respBodySnapshot3, 'body schema markers are idempotent');

const respBodySpec2 = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/zamowienia': { post: {
    summary: 'Zamówienie [response: 500 Wewnętrzny błąd #Blad {"code": "ERR"}]',
    responses: {}
  } } },
  definitions: { Blad: { type: 'object', properties: { code: { type: 'string' } } } }
};
applyMarkers(respBodySpec2);
const respBodyOp2 = respBodySpec2.paths['/zamowienia'].post;
assert(respBodyOp2.responses['500'].schema.$ref === '#/definitions/Blad', 'Swagger2: the body schema lands in schema');
assert(respBodyOp2.responses['500'].description === 'Wewnętrzny błąd',
  'an unquoted description ends where the #schema token starts');
assert(JSON.stringify(respBodyOp2.responses['500'].examples['application/json']) === '{"code":"ERR"}',
  'Swagger2: the example still lands in examples');
assert(respBodyOp2.summary === 'Zamówienie', 'the marker is removed from summary');

const respOrderSpec = {
  openapi: '3.1.0', info: { title: 'T', version: '1' },
  paths: { '/kolejnosc': { get: {
    description: '[response: 4XX "Klient"] [response: 5XX "Serwer"] [response: default "Domyslna"]',
    responses: {}
  } } }
};
applyMarkers(respOrderSpec);
assert(Object.keys(respOrderSpec.paths['/kolejnosc'].get.responses).join() === '4XX,5XX,default',
  'non-numeric codes keep the order they were written in, not the reverse');

const respNoResponses = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/y': { delete: { description: '[response: 204]' } } }
};
applyMarkers(respNoResponses);
assert(respNoResponses.paths['/y'].delete.responses['204'].description === 'No Content',
  'an operation without a responses object gets one');

console.log('example-fill-test OK');
