const { walkSpec, walkOperations } = require('./specWalk');
const {
  scanTags, SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES,
  matchTagField, isArraySchema, fieldFitsNode,
  coerceValue, resolveScalarType, coerceTagValue
} = require('./markerScanner');
const {
  schemaHost, jsonList, wrapRefForSiblings, objectTarget, itemsTarget,
  stripTagSpans, exampleTagValue, defaultTagValue, stripDescriptionTags
} = require('./modelValues');
const { applyOperationTags } = require('./operationMarkers');

const NULLABLE_REPLACED_BY_TYPE_NULL = 3.1;

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

function spreadPayload(node, parsed, host, wrapRefs, stats) {
  const items = itemsTarget(node, host);
  const rows = Array.isArray(parsed) ? parsed.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) : null;

  if (items) {
    const row = rows ? rows[0] : parsed;
    if (!row || typeof row !== 'object') return 'an example for a list must be an object or a list of objects';
    if (!objectTarget(items, host)) return 'the list element is not an object with fields';
    const acceptedRow = spreadExample(items, row, host, wrapRefs, stats);
    if (!acceptedRow) return 'no key from the example matches the fields of the list element';
    setWholeExample(node, [acceptedRow], wrapRefs, stats);
    return null;
  }

  const value = rows ? (rows.length === 1 ? rows[0] : null) : parsed;
  if (!value || typeof value !== 'object') return 'the example has several rows but the field is not a list';
  if (!objectTarget(node, host)) return 'the field is not an object with fields — use [example:]';
  const accepted = spreadExample(node, value, host, wrapRefs, stats);
  if (!accepted) return 'no key from the example matches the fields of this object';
  setWholeExample(node, accepted, wrapRefs, stats);
  return null;
}

function setWholeExample(node, value, wrapRefs, stats) {
  if (wrapRefs && wrapRefForSiblings(node)) stats.refsWrapped += 1;
  node.example = value;
  stats.examplesAdded += 1;
}

function setLeafExample(prop, value, wrapRefs, stats) {
  if (wrapRefs && wrapRefForSiblings(prop)) stats.refsWrapped += 1;
  prop.example = value;
  stats.examplesAdded += 1;
  stats.fromTags += 1;
}

function spreadExample(node, value, host, wrapRefs, stats, path) {
  const target = objectTarget(node, host);
  if (!target) return null;
  const accepted = {};
  let any = false;
  for (const [key, val] of Object.entries(value)) {
    const at = path ? path + '.' + key : key;
    const prop = target.properties[key];
    if (!prop) { stats.unknownKeys.push(at); continue; }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const inner = spreadExample(prop, val, host, wrapRefs, stats, at);
      if (inner) { accepted[key] = inner; any = true; continue; }
    }
    if (Array.isArray(val) && val.length === 1 && val[0] && typeof val[0] === 'object' && !Array.isArray(val[0])) {
      const items = itemsTarget(prop, host);
      const inner = items && spreadExample(items, val[0], host, wrapRefs, stats, at + '[]');
      if (inner) { accepted[key] = [inner]; any = true; continue; }
    }
    setLeafExample(prop, val, wrapRefs, stats);
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

function applyFieldTags(node, stats, version, isSwagger2Param, host, arrayOf, wrapRefs, path) {
  const isSwagger2 = version < 3;
  const text = String(node.description || '');
  if (text.indexOf('[') < 0) return;
  const applied = [];
  for (const tag of scanTags(text).reverse()) {
    const field = matchTagField(tag.key, SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES);
    if (!field) continue;

    if (field.kind === 'spread') {
      const parsed = parseJsonValue(tag.raw);
      if (parsed === undefined) {
        stats.notApplied.push({ path: path, reason: 'the value is not valid JSON' });
        continue;
      }
      const problem = spreadPayload(node, parsed, host, wrapRefs, stats);
      if (problem) { stats.notApplied.push({ path: path, reason: problem }); continue; }
      applied.push(tag);
      stats.tagFields += 1;
      continue;
    }

    let placed;
    if (field.kind === 'example') {
      placed = placeExample(tag.raw, node, arrayOf, host);
    } else {
      const v = coerceTagValue(field.kind, tag.raw, node, host);
      placed = v === undefined ? undefined : { target: node, value: v };
    }
    if (placed === undefined) continue;
    const value = placed.value;

    if (!fieldFitsNode(field.name, value, placed.target, host)) continue;

    let name = field.name;
    if (isSwagger2 && NO_SWAGGER2_SCHEMA_FIELD[name]) {
      stats.notApplied.push({ path: path, reason: name +
        ' has no field in Swagger 2.0 and no established x- extension — kept in the description' });
      continue;
    }
    if (isSwagger2 && SWAGGER2_SCHEMA_EXTENSION[name]) name = SWAGGER2_SCHEMA_EXTENSION[name];

    if (wrapRefs && wrapRefForSiblings(placed.target)) stats.refsWrapped += 1;
    if (name === 'example' && isSwagger2Param) name = 'x-example';
    if (name === 'nullable' && version >= NULLABLE_REPLACED_BY_TYPE_NULL) {
      if (value === true) markNullableType(placed.target);
      applied.push(tag);
      stats.tagFields += 1;
      continue;
    }
    placed.target[name] = value;
    applied.push(tag);
    stats.tagFields += 1;

    if (name === 'example' || name === 'x-example') {
      stats.examplesAdded += 1;
      stats.fromTags += 1;
    }
    else if (name === 'default') stats.defaultsAdded += 1;
  }
  stripTagSpans(node, text, applied);
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

function checkPatternAgainstExample(node, path, stats) {
  if (!node.pattern || typeof node.example !== 'string') return;
  let re;
  try { re = new RegExp(node.pattern); } catch (e) { return; }
  if (!re.test(node.example)) stats.mismatched.push(path);
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
  const wrapRefs = refSiblingsIgnored(spec);
  const version = specVersion(spec);
  walkSpec(spec, (node, path, exampleKey, arrayOf) => {
    applyFieldTags(node, stats, version, exampleKey === 'x-example', host, arrayOf, wrapRefs, path);

    checkPatternAgainstExample(node, path, stats);
  });
  return stats;
}

module.exports = {
  applyMarkers, liftDescriptionTags, protectRefSiblings,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
};

module.exports = {
  applyMarkers, liftDescriptionTags, protectRefSiblings,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
};
