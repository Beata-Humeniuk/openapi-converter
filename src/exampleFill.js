const { refName, schemaHost } = require('./schemaShared');
const { walkSpec, walkOperations } = require('./specWalk');
const {
  scanTags, tidyDescription,
  SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES,
  matchTagField, isArraySchema, fieldFitsNode,
  coerceValue, coerceTagValue, resolveScalarType,
  parseResponseMarker, responseReason
} = require('./markerScanner');

function refSiblingsIgnored(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.swagger === '2.0') return true;
  const v = parseFloat(String(spec.openapi || ''));
  return !isNaN(v) && v < 3.1;
}

function wrapRefForSiblings(node) {
  if (!node || typeof node !== 'object' || !node.$ref) return false;
  const ref = node.$ref;
  delete node.$ref;
  const rest = Object.assign({}, node);
  for (const key of Object.keys(node)) delete node[key];
  node.allOf = [{ $ref: ref }];
  Object.assign(node, rest);
  return true;
}

function jsonList(raw) {
  const t = String(raw === undefined ? '' : raw).trim();
  if (t[0] !== '[') return null;
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
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

function objectTarget(node, host, seen) {
  if (!node || typeof node !== 'object') return null;
  if (node.properties) return node;
  const visited = seen || new Set();
  if (visited.has(node)) return null;
  visited.add(node);
  const named = node.$ref && host && host[refName(node.$ref)];

  if (named) {
    const inner = objectTarget(named, host, visited);
    if (inner) return inner;
  }
  for (const part of node.allOf || []) {
    const inner = objectTarget(part, host, visited);
    if (inner) return inner;
  }
  return null;
}

function itemsTarget(node, host) {
  if (!node || typeof node !== 'object') return null;
  if (node.items) return node.items;
  const named = node.$ref && host && host[refName(node.$ref)];
  return named && named.items ? named.items : null;
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

function stripTagSpans(node, text, applied, key) {
  if (!applied.length) return;
  const field = key || 'description';
  let out = text;
  for (const tag of applied) out = out.slice(0, tag.start) + out.slice(tag.end);
  const cleaned = tidyDescription(out);
  if (cleaned) node[field] = cleaned;
  else delete node[field];
}

function applyFieldTags(node, stats, isSwagger2, isSwagger2Param, host, arrayOf, wrapRefs, path) {
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

    if (wrapRefs && wrapRefForSiblings(placed.target)) stats.refsWrapped += 1;
    let name = field.name;
    if (name === 'example' && isSwagger2Param) name = 'x-example';
    if (name === 'nullable' && isSwagger2) name = 'x-nullable';
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

function rekeyContent(content, mimes) {
  const keys = Object.keys(content || {});
  if (!keys.length) return null;
  const out = {};
  for (const m of mimes) out[m] = content[m] || content[keys[0]];
  return out;
}

function responseExampleMime(op, r) {
  if (r.content && Object.keys(r.content).length) return Object.keys(r.content)[0];
  for (const other of Object.values(op.responses || {})) {
    if (other && typeof other === 'object' && other.content && Object.keys(other.content).length) {
      return Object.keys(other.content)[0];
    }
  }
  return 'application/json';
}

function applyResponseMarker(op, parsed, isSwagger2, rootProduces, stats) {
  if (isSwagger2 && /XX$/.test(parsed.code)) {
    return 'the ' + parsed.code + ' code range needs OpenAPI 3.x — Swagger 2.0 accepts only exact codes';
  }
  if (!op.responses || typeof op.responses !== 'object') op.responses = {};
  let r = op.responses[parsed.code];
  if (r && typeof r === 'object' && r.$ref) {
    return 'response ' + parsed.code + ' is a $ref reference — edit the shared response instead';
  }
  if (!r || typeof r !== 'object') {
    r = { description: parsed.description || responseReason(parsed.code) };
    op.responses[parsed.code] = r;
    stats.responsesAdded += 1;
  } else if (parsed.description) {
    r.description = parsed.description;
  }
  if (parsed.example !== undefined) {
    if (isSwagger2) {
      const mime = (op.produces && op.produces[0]) || (rootProduces && rootProduces[0]) || 'application/json';
      if (!r.examples || typeof r.examples !== 'object') r.examples = {};
      r.examples[mime] = parsed.example;
    } else {
      const mime = responseExampleMime(op, r);
      if (!r.content || typeof r.content !== 'object') r.content = {};
      if (!r.content[mime] || typeof r.content[mime] !== 'object') r.content[mime] = {};
      r.content[mime].example = parsed.example;
    }
    stats.examplesAdded += 1;
  }
  return null;
}

function applyOperationTags(op, isSwagger2, stats, rootProduces, label) {
  for (const key of ['summary', 'description']) {
    applyOperationTagsIn(op, key, isSwagger2, stats, rootProduces, label);
  }
}

function applyOperationTagsIn(op, key, isSwagger2, stats, rootProduces, label) {
  const text = String(op[key] || '');
  if (text.indexOf('[') < 0) return;
  const applied = [];
  const assignedHere = [];
  for (const tag of scanTags(text).reverse()) {
    const field = matchTagField(tag.key, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES);
    if (!field) continue;
    if (field.kind === 'response') {
      const parsed = parseResponseMarker(tag.raw);
      const problem = parsed.error || applyResponseMarker(op, parsed, isSwagger2, rootProduces, stats);
      if (problem) { stats.notApplied.push({ path: label || 'operation', reason: problem }); continue; }
      applied.push(tag);
      stats.tagFields += 1;
      continue;
    }
    const value = coerceTagValue(field.kind, tag.raw, op);
    if (value === undefined) continue;
    if (field.name === 'consumes' || field.name === 'produces') {
      if (!value.length) continue;
      if (isSwagger2) {
        op[field.name] = value;
      } else if (field.name === 'consumes') {
        if (!op.requestBody || !rekeyContent(op.requestBody.content, value)) continue;
        op.requestBody.content = rekeyContent(op.requestBody.content, value);
      } else {
        let any = false;
        for (const r of Object.values(op.responses || {})) {
          if (!r || typeof r !== 'object' || !r.content) continue;
          const rekeyed = rekeyContent(r.content, value);
          if (rekeyed) { r.content = rekeyed; any = true; }
        }
        if (!any) continue;
      }
      stats.mediaSet += 1;
    } else {
      op[field.name] = value;
      if (field.name === key) assignedHere.push(value);
      stats.tagFields += 1;
    }
    applied.push(tag);
  }
  stripTagSpans(op, text, applied, key);

  if (assignedHere.length) op[key] = assignedHere[0];
}

function taggedFieldValue(schema, wanted) {
  for (const tag of scanTags(String((schema && schema.description) || ''))) {
    if (String(tag.key).toLowerCase() !== wanted) continue;
    return coerceTagValue('example', tag.raw, schema || {});
  }
  return undefined;
}

function exampleTagValue(schema) { return taggedFieldValue(schema, 'example'); }
function defaultTagValue(schema) { return taggedFieldValue(schema, 'default'); }

function stripDescriptionTags(description) {
  const text = String(description || '');
  if (text.indexOf('[') < 0) return text;
  const known = scanTags(text).filter((tag) =>
    matchTagField(tag.key, SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES) ||
    matchTagField(tag.key, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES));
  if (!known.length) return text;
  let out = text;
  for (const tag of known.reverse()) out = out.slice(0, tag.start) + out.slice(tag.end);
  return tidyDescription(out);
}

function newStats() {
  return { examplesAdded: 0, defaultsAdded: 0, fromTags: 0, mediaSet: 0, tagFields: 0, refsWrapped: 0, responsesAdded: 0, mismatched: [], unknownKeys: [], notApplied: [] };
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
  walkOperations(spec, (op, label) => applyOperationTags(op, isSwagger2, stats, spec.produces, label));
  const wrapRefs = refSiblingsIgnored(spec);
  walkSpec(spec, (node, path, exampleKey, arrayOf) => {
    applyFieldTags(node, stats, isSwagger2, exampleKey === 'x-example', host, arrayOf, wrapRefs, path);

    checkPatternAgainstExample(node, path, stats);
  });
  return stats;
}

module.exports = {
  applyMarkers, liftDescriptionTags,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
};
