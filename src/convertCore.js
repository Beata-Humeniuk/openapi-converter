const swagger2openapi = require('swagger2openapi');
const { Converter: DownConverter } = require('@apiture/openapi-down-convert');
const { upgrade30to31, modernizeSchemasInDoc } = require('./upgrade30to31');
const { downgrade30to20 } = require('./downgrade30to20');
const { downgrade32to31 } = require('./downgrade32to31');

const OPENAPI_VERSIONS = {
  '2.0': ['2.0'],
  '3.0': ['3.0.0', '3.0.1', '3.0.2', '3.0.3', '3.0.4'],
  '3.1': ['3.1.0', '3.1.1', '3.1.2'],
  '3.2': ['3.2.0']
};
const LATEST_VERSION = {
  '2.0': '2.0',
  '3.0': '3.0.4',
  '3.1': '3.1.2',
  '3.2': '3.2.0'
};

function versionFamily(version) {
  if (version === '2.0') return '2.0';
  const m = /^(3\.\d+)(?:\.\d+.*)?$/.exec(String(version));
  return m ? m[1] : null;
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];

function withDefaultMedia20(spec) {
  const needsConsumes = (op) => !spec.consumes && !op.consumes &&
    (op.parameters || []).some((p) => p.in === 'body' || p.in === 'formData');
  const needsProduces = (op) => !spec.produces && !op.produces &&
    Object.values(op.responses || {}).some((r) => r && r.schema);

  let dirty = false;
  for (const pathItem of Object.values(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (op && (needsConsumes(op) || needsProduces(op))) dirty = true;
    }
  }
  if (!dirty) return spec;

  const out = JSON.parse(JSON.stringify(spec));
  for (const pathItem of Object.values(out.paths || {})) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      if (needsConsumes(op)) op.consumes = ['application/json'];
      if (needsProduces(op)) op.produces = ['application/json'];
    }
  }
  return out;
}

const LITERAL_KEYS = new Set(['example', 'examples', 'enum', 'const', 'default']);

function fixNumericExclusiveBounds(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(fixNumericExclusiveBounds); return; }
  if (typeof node.exclusiveMinimum === 'number') {
    if (typeof node.minimum === 'number' && node.minimum > node.exclusiveMinimum) {
      delete node.exclusiveMinimum;
    } else {
      node.minimum = node.exclusiveMinimum;
      node.exclusiveMinimum = true;
    }
  }
  if (typeof node.exclusiveMaximum === 'number') {
    if (typeof node.maximum === 'number' && node.maximum < node.exclusiveMaximum) {
      delete node.exclusiveMaximum;
    } else {
      node.maximum = node.exclusiveMaximum;
      node.exclusiveMaximum = true;
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (!LITERAL_KEYS.has(key)) fixNumericExclusiveBounds(value);
  }
}

const DROPPED_BY_DOWNCONVERT = ['patternProperties', 'propertyNames', 'unevaluatedProperties'];

function warnDroppedSchemaKeywords(node, path, warn) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => warnDroppedSchemaKeywords(item, path + '/' + i, warn));
    return;
  }
  for (const key of DROPPED_BY_DOWNCONVERT) {
    if (key in node) warn.push('`' + key + '` does not exist in 3.0 — removed (' + (path || '/') + ')');
  }
  for (const [key, value] of Object.entries(node)) {
    if (!LITERAL_KEYS.has(key)) warnDroppedSchemaKeywords(value, path + '/' + key, warn);
  }
}

function detectVersion(spec) {
  if (!spec || typeof spec !== 'object') return null;
  if (spec.swagger === '2.0') return '2.0';
  if (typeof spec.openapi === 'string') return versionFamily(spec.openapi);
  return null;
}

function detectExactVersion(spec) {
  if (!spec || typeof spec !== 'object') return null;
  if (spec.swagger === '2.0') return '2.0';
  if (typeof spec.openapi === 'string') return spec.openapi;
  return null;
}

async function to30(spec, from, warn) {
  if (from === '2.0') {
    const result = await swagger2openapi.convertObj(withDefaultMedia20(spec), { patch: true, warnOnly: true, anchors: true, resolve: false });
    return result.openapi;
  }
  if (from === '3.2') {
    const step = downgrade32to31(spec);
    warn.push(...step.warnings);
    spec = step.openapi;
    from = '3.1';
  }
  if (from === '3.1') {
    warnDroppedSchemaKeywords(spec, '', warn);
    const out = new DownConverter(spec, { allowRefSiblings: true }).convert();
    fixNumericExclusiveBounds(out);
    return out;
  }
  return spec;
}

async function to31(spec, from, warn) {
  if (from === '3.1') return modernizeSchemasInDoc(JSON.parse(JSON.stringify(spec)));
  if (from === '3.2') {
    const step = downgrade32to31(spec);
    warn.push(...step.warnings);
    return modernizeSchemasInDoc(step.openapi);
  }
  return upgrade30to31(await to30(spec, from, warn));
}

async function convertSpec(spec, target) {
  const from = detectVersion(spec);
  if (!from) throw new Error('unsupported-input');
  if (!(from in LATEST_VERSION)) throw new Error('unsupported-input-version: ' + detectExactVersion(spec));
  const targetFamily = versionFamily(target);
  if (!targetFamily || !(targetFamily in LATEST_VERSION)) throw new Error('unsupported-target: ' + target);
  const exact = target === targetFamily ? null : target;

  if (from === targetFamily) {
    if (targetFamily === '2.0') return { from, openapi: withDefaultMedia20(spec), warnings: [] };
    if (!exact || spec.openapi === exact) return { from, openapi: spec, warnings: [] };
    return { from, openapi: Object.assign({}, spec, { openapi: exact }), warnings: [] };
  }

  const warnings = [];
  const stamp = (doc) => { doc.openapi = exact || LATEST_VERSION[targetFamily]; return doc; };

  if (targetFamily === '3.0') {
    return { from, openapi: stamp(await to30(spec, from, warnings)), warnings };
  }
  if (targetFamily === '3.1') {
    return { from, openapi: stamp(await to31(spec, from, warnings)), warnings };
  }
  if (targetFamily === '3.2') {
    return { from, openapi: stamp(await to31(spec, from, warnings)), warnings };
  }
  const swagger20 = downgrade30to20(await to30(spec, from, warnings));
  warnings.push(...swagger20.warnings);
  return { from, openapi: withDefaultMedia20(swagger20.swagger), warnings };
}

const CANONICAL_ORDER = [
  'swagger', 'openapi', '$self', 'info', 'externalDocs',
  'host', 'basePath', 'schemes', 'consumes', 'produces', 'servers',
  'tags', 'security', 'securityDefinitions',
  'paths', 'webhooks',
  'parameters', 'responses', 'definitions', 'components'
];

function canonicalOrder(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  const out = {};
  for (const key of CANONICAL_ORDER) if (key in doc) out[key] = doc[key];
  for (const key of Object.keys(doc)) if (!(key in out)) out[key] = doc[key];
  return out;
}

module.exports = {
  detectVersion, detectExactVersion, convertSpec, canonicalOrder,
  OPENAPI_VERSIONS, LATEST_VERSION
};
