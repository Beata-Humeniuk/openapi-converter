const { walkSpec, walkOperations } = require('./specWalk');
const {
  scanTags, SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES,
  matchTagField, isArraySchema, fieldFitsNode,
  coerceValue, resolveScalarType, coerceTagValue
} = require('./markerScanner');
const {
  schemaHost, jsonList, wrapRefForSiblings, objectTarget, itemsTarget,
  stripTagSpans, exampleTagValue, defaultTagValue, stripDescriptionTags, writtenExample
} = require('./modelValues');
const { applyOperationTags } = require('./operationMarkers');

const NULLABLE_REPLACED_BY_TYPE_NULL = 3.1;
const SCHEMA_EXAMPLE_IS_A_LIST = 3.1;

const PARAMETER_OWN_FIELDS = { example: true, deprecated: true };

function specVersion(spec) {
  if (!spec || typeof spec !== 'object') return 3.0;
  if (spec.swagger === '2.0') return 2.0;
  const v = parseFloat(String(spec.openapi || ''));
  return isNaN(v) ? 3.0 : v;
}

const SWAGGER2_SCHEMA_EXTENSION = { nullable: 'x-nullable', deprecated: 'x-deprecated' };
const NO_SWAGGER2_SCHEMA_FIELD = { writeOnly: true };

function refSiblingsIgnored(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.swagger === '2.0') return true;
  const v = parseFloat(String(spec.openapi || ''));
  return !isNaN(v) && v < 3.1;
}

function placeExample(raw, node, arrayOf, host) {
  if (arrayOf && !isArraySchema(node)) {
    const list = jsonList(raw);
    if (list) return { target: arrayOf, value: list };
  }
  const value = coerceValue(raw, resolveScalarType(node, host));
  if (value === undefined) return undefined;
  if (isArraySchema(node) && value !== null && !Array.isArray(value)) {
    return { target: node, value: [value] };
  }
  return { target: node, value: value };
}

function parseJsonValue(raw) {
  const s = String(raw === undefined ? '' : raw).trim();
  if (s[0] !== '{' && s[0] !== '[') return undefined;
  try { return JSON.parse(s); } catch (e) { return undefined; }
}

function spreadPayload(node, parsed, ctx) {
  const items = itemsTarget(node, ctx.host);
  const rows = Array.isArray(parsed) ? parsed.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) : null;

  if (items) {
    const row = rows ? rows[0] : parsed;
    if (!row || typeof row !== 'object') return 'an example for a list must be an object or a list of objects';
    if (!objectTarget(items, ctx.host)) return 'the list element is not an object with fields';
    const acceptedRow = spreadExample(items, row, ctx);
    if (!acceptedRow) return 'no key from the example matches the fields of the list element';
    setSchemaExample(node, [acceptedRow], ctx);
    return null;
  }

  const value = rows ? (rows.length === 1 ? rows[0] : null) : parsed;
  if (!value || typeof value !== 'object') return 'the example has several rows but the field is not a list';
  if (!objectTarget(node, ctx.host)) return 'the field is not an object with fields — use [example:]';
  const accepted = spreadExample(node, value, ctx);
  if (!accepted) return 'no key from the example matches the fields of this object';
  setSchemaExample(node, accepted, ctx);
  return null;
}

function setSchemaExample(node, value, ctx) {
  if (ctx.wrapRefs && wrapRefForSiblings(node)) ctx.stats.refsWrapped += 1;
  if (ctx.version >= SCHEMA_EXAMPLE_IS_A_LIST) {
    delete node.example;
    node.examples = [value];
  } else {
    node.example = value;
  }
  ctx.stats.examplesAdded += 1;
}

function setLeafExample(prop, value, ctx) {
  setSchemaExample(prop, value, ctx);
  ctx.stats.fromTags += 1;
}

function spreadExample(node, value, ctx, path) {
  const target = objectTarget(node, ctx.host);
  if (!target) return null;
  const accepted = {};
  let any = false;
  for (const [key, val] of Object.entries(value)) {
    const at = path ? path + '.' + key : key;
    const prop = target.properties[key];
    if (!prop) { ctx.stats.unknownKeys.push(at); continue; }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const inner = spreadExample(prop, val, ctx, at);
      if (inner) { accepted[key] = inner; any = true; continue; }
    }
    if (Array.isArray(val) && val.length === 1 && val[0] && typeof val[0] === 'object' && !Array.isArray(val[0])) {
      const items = itemsTarget(prop, ctx.host);
      const inner = items && spreadExample(items, val[0], ctx, at + '[]');
      if (inner) { accepted[key] = [inner]; any = true; continue; }
    }
    setLeafExample(prop, val, ctx);
    accepted[key] = val;
    any = true;
  }
  return any ? accepted : null;
}

function markNullableType(node) {
  if (typeof node.type === 'string') node.type = [node.type, 'null'];
  else if (Array.isArray(node.type)) { if (node.type.indexOf('null') < 0) node.type.push('null'); }
  else node.type = 'null';
}

function applyFieldTags(node, ctx, isSwagger2Param, arrayOf, path, owner) {
  const isSwagger2 = ctx.version < 3;
  const textHost = owner || node;
  const text = String(textHost.description || '');
  if (text.indexOf('[') < 0) return;
  const applied = [];
  for (const tag of scanTags(text).reverse()) {
    const field = matchTagField(tag.key, SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES);
    if (!field) continue;

    if (field.kind === 'spread') {
      const parsed = parseJsonValue(tag.raw);
      if (parsed === undefined) {
        ctx.stats.notApplied.push({ path: path, reason: 'the value is not valid JSON' });
        continue;
      }
      const problem = spreadPayload(node, parsed, ctx);
      if (problem) { ctx.stats.notApplied.push({ path: path, reason: problem }); continue; }
      applied.push(tag);
      ctx.stats.tagFields += 1;
      continue;
    }

    let placed;
    if (field.kind === 'example') {
      placed = placeExample(tag.raw, node, arrayOf, ctx.host);
    } else {
      const v = coerceTagValue(field.kind, tag.raw, node, ctx.host);
      placed = v === undefined ? undefined : { target: node, value: v };
    }
    if (placed === undefined) continue;
    const value = placed.value;

    if (!fieldFitsNode(field.name, value, placed.target, ctx.host)) continue;

    let name = field.name;
    if (isSwagger2 && NO_SWAGGER2_SCHEMA_FIELD[name]) {
      ctx.stats.notApplied.push({ path: path, reason: name +
        ' has no field in Swagger 2.0 and no established x- extension — kept in the description' });
      continue;
    }
    if (isSwagger2 && SWAGGER2_SCHEMA_EXTENSION[name]) name = SWAGGER2_SCHEMA_EXTENSION[name];

    let target = placed.target;
    if (owner && (field.kind === 'json' || PARAMETER_OWN_FIELDS[name])) target = owner;

    if (name === 'example' && isSwagger2Param) name = 'x-example';
    if (name === 'nullable' && ctx.version >= NULLABLE_REPLACED_BY_TYPE_NULL) {
      if (value === true) markNullableType(placed.target);
      applied.push(tag);
      ctx.stats.tagFields += 1;
      continue;
    }
    if (name === 'example' && target === owner && owner.examples && typeof owner.examples === 'object') {
      ctx.stats.notApplied.push({ path: path, reason:
        'the parameter already carries named examples, and `example` and `examples` exclude each other' });
      continue;
    }

    if (name === 'example' && target !== owner) {
      setLeafExample(target, value, ctx);
      applied.push(tag);
      ctx.stats.tagFields += 1;
      continue;
    }

    if (ctx.wrapRefs && wrapRefForSiblings(target)) ctx.stats.refsWrapped += 1;
    target[name] = value;
    applied.push(tag);
    ctx.stats.tagFields += 1;

    if (name === 'example' || name === 'x-example') {
      ctx.stats.examplesAdded += 1;
      ctx.stats.fromTags += 1;
    }
    else if (name === 'default') ctx.stats.defaultsAdded += 1;
  }
  stripTagSpans(textHost, text, applied);
}

function protectRefSiblings(spec) {
  walkSpec(spec, (node) => {
    if (!node || !node.$ref || typeof node.description !== 'string') return;
    if (stripDescriptionTags(node.description) !== node.description) wrapRefForSiblings(node);
  });
  return spec;
}

function newStats() {
  return {
    examplesAdded: 0, defaultsAdded: 0, fromTags: 0, mediaSet: 0,
    tagFields: 0, refsWrapped: 0, responsesAdded: 0,
    mismatched: [], unknownKeys: [], notApplied: []
  };
}

function checkPatternAgainstExample(node, path, stats, owner) {
  if (!node.pattern) return;
  const value = owner && owner.example !== undefined ? owner.example : writtenExample(node);
  if (typeof value !== 'string') return;
  let re;
  try { re = new RegExp(node.pattern); } catch (e) { return; }
  if (!re.test(value) && stats.mismatched.indexOf(path) < 0) stats.mismatched.push(path);
}

function liftDescriptionTags(spec) {
  return applyMarkers(spec);
}

function applyMarkers(spec) {
  const stats = newStats();
  if (!spec || typeof spec !== 'object') return stats;
  const isSwagger2 = spec.swagger === '2.0';
  const host = schemaHost(spec);
  walkOperations(spec, (op, label) => applyOperationTags(op, isSwagger2, stats, spec.produces, label, host));
  const ctx = { stats: stats, host: host, wrapRefs: refSiblingsIgnored(spec), version: specVersion(spec) };
  walkSpec(spec, (node, path, exampleKey, arrayOf, owner) => {
    applyFieldTags(node, ctx, exampleKey === 'x-example', arrayOf, path, owner);

    checkPatternAgainstExample(node, path, stats, owner);
  });
  return stats;
}

module.exports = {
  applyMarkers, liftDescriptionTags, protectRefSiblings,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
};
