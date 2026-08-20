const SUB_ONE = ['items', 'not', 'contains', 'propertyNames', 'additionalProperties',
  'unevaluatedProperties', 'unevaluatedItems', 'if', 'then', 'else'];
const SUB_LIST = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SUB_MAP = ['properties', 'patternProperties', 'dependentSchemas', '$defs', 'definitions'];

const LITERAL_KEYS = new Set(['example', 'examples', 'enum', 'const', 'default']);

function forEachSchema(schema, fn) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  fn(schema);
  for (const key of SUB_ONE) forEachSchema(schema[key], fn);
  for (const key of SUB_LIST) {
    if (Array.isArray(schema[key])) for (const sub of schema[key]) forEachSchema(sub, fn);
  }
  for (const key of SUB_MAP) {
    const map = schema[key];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const sub of Object.values(map)) forEachSchema(sub, fn);
    }
  }
}

function forEachSchemaInDoc(doc, fn) {
  const roots = [];
  (function collect(node) {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== 'object') return;
    if (node.schema && typeof node.schema === 'object') roots.push(node.schema);
    if (node.itemSchema && typeof node.itemSchema === 'object') roots.push(node.itemSchema);
    for (const [key, value] of Object.entries(node)) {
      if (!LITERAL_KEYS.has(key)) collect(value);
    }
  })(doc);
  const compSchemas = doc.components && doc.components.schemas;
  if (compSchemas && typeof compSchemas === 'object') roots.push(...Object.values(compSchemas));
  for (const root of roots) forEachSchema(root, fn);
}

function modernizeSchema(s) {
  if (s.nullable === true) {
    if (typeof s.type === 'string') s.type = [s.type, 'null'];
    else if (Array.isArray(s.type) && !s.type.includes('null')) s.type.push('null');
  }
  delete s.nullable;

  if (s.exclusiveMinimum === true && typeof s.minimum === 'number') {
    s.exclusiveMinimum = s.minimum;
    delete s.minimum;
  } else if (typeof s.exclusiveMinimum === 'boolean') {
    delete s.exclusiveMinimum;
  }
  if (s.exclusiveMaximum === true && typeof s.maximum === 'number') {
    s.exclusiveMaximum = s.maximum;
    delete s.maximum;
  } else if (typeof s.exclusiveMaximum === 'boolean') {
    delete s.exclusiveMaximum;
  }

  if ('example' in s && !('examples' in s)) {
    s.examples = [s.example];
    delete s.example;
  }

  const isString = s.type === 'string' || (Array.isArray(s.type) && s.type.includes('string'));
  if (isString && s.format === 'byte') {
    delete s.format;
    if (!('contentEncoding' in s)) s.contentEncoding = 'base64';
  }
  if (isString && s.format === 'binary') {
    delete s.format;
    if (!('contentMediaType' in s)) s.contentMediaType = 'application/octet-stream';
  }
}

function modernizeSchemasInDoc(doc) {
  forEachSchemaInDoc(doc, modernizeSchema);
  return doc;
}

function upgrade30to31(doc) {
  const out = JSON.parse(JSON.stringify(doc));
  out.openapi = '3.1.0';
  return modernizeSchemasInDoc(out);
}

module.exports = { upgrade30to31, modernizeSchemasInDoc };
