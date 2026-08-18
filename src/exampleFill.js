const { refName, schemaHost } = require('./schemaShared');
const { walkSpec, walkOperations } = require('./specWalk');
const {
  scanTags, tidyDescription,
  SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES,
  matchTagField, isArraySchema, fieldFitsNode,
  coerceValue, coerceTagValue, resolveScalarType,
  parseResponseMarker, parseCaseMarker, responseReason
} = require('./markerScanner');

// 2.0, 3.0, 3.1, 3.2 — decyduje o tym, ktore pola schematu wolno zapisac.
function specVersion(spec) {
  if (!spec || typeof spec !== 'object') return 3.0;
  if (spec.swagger === '2.0') return 2.0;
  const v = parseFloat(String(spec.openapi || ''));
  return isNaN(v) ? 3.0 : v;
}

// Swagger 2.0 ma zamkniety obiekt schematu: tylko wlasne pola i rozszerzenia
// x-. Dla tych trzech markerow nie ma pola oficjalnego. Gdzie istnieje utarte
// rozszerzenie, piszemy je; gdzie nie ma zadnego — znacznik zostaje w opisie.
const SWAGGER2_SCHEMA_FIELD = {
  nullable: 'x-nullable',
  deprecated: 'x-deprecated',
  writeOnly: null
};

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

function markNullableType(node) {
  if (typeof node.type === 'string') node.type = [node.type, 'null'];
  else if (Array.isArray(node.type)) { if (node.type.indexOf('null') < 0) node.type.push('null'); }
  else node.type = 'null';
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
    if (isSwagger2 && Object.prototype.hasOwnProperty.call(SWAGGER2_SCHEMA_FIELD, name)) {
      const stand = SWAGGER2_SCHEMA_FIELD[name];
      if (!stand) {
        stats.notApplied.push({ path: path, reason: name +
          ' has no field in Swagger 2.0 and no established x- extension — kept in the description' });
        continue;
      }
      name = stand;
    }

    if (wrapRefs && wrapRefForSiblings(placed.target)) stats.refsWrapped += 1;
    if (name === 'example' && isSwagger2Param) name = 'x-example';
    // 3.1 usunelo slowo kluczowe nullable na rzecz tablicy typow.
    if (name === 'nullable' && version >= 3.1) {
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

function reportUnknownExampleKeys(value, schema, host, at, stats) {
  if (!value || typeof value !== 'object' || !schema) return;
  if (Array.isArray(value)) {
    const items = itemsTarget(schema, host);
    if (!items) return;
    for (const row of value) reportUnknownExampleKeys(row, items, host, at + '[]', stats);
    return;
  }
  const target = objectTarget(schema, host);
  if (!target) return;
  for (const [key, val] of Object.entries(value)) {
    const prop = target.properties[key];
    if (!prop) { stats.unknownKeys.push(at + '.' + key); continue; }
    reportUnknownExampleKeys(val, prop, host, at + '.' + key, stats);
  }
}

function applyResponseMarker(op, parsed, isSwagger2, rootProduces, stats, host, label) {
  if (isSwagger2 && /XX$/.test(parsed.code)) {
    return 'the ' + parsed.code + ' code range needs OpenAPI 3.x — Swagger 2.0 accepts only exact codes';
  }
  if (parsed.ref && !(host && host[parsed.ref])) {
    return 'the body schema ' + parsed.ref + ' does not exist in the file';
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
  if (parsed.ref === undefined && parsed.example === undefined) return null;
  let schema;
  if (isSwagger2) {
    if (parsed.ref) r.schema = { $ref: '#/definitions/' + parsed.ref };
    schema = r.schema;
    if (parsed.example !== undefined) {
      const mime = (op.produces && op.produces[0]) || (rootProduces && rootProduces[0]) || 'application/json';
      if (!r.examples || typeof r.examples !== 'object') r.examples = {};
      r.examples[mime] = parsed.example;
    }
  } else {
    const mime = responseExampleMime(op, r);
    if (!r.content || typeof r.content !== 'object') r.content = {};
    if (!r.content[mime] || typeof r.content[mime] !== 'object') r.content[mime] = {};
    if (parsed.ref) r.content[mime].schema = { $ref: '#/components/schemas/' + parsed.ref };
    schema = r.content[mime].schema;
    if (parsed.example !== undefined) r.content[mime].example = parsed.example;
  }
  if (parsed.example !== undefined) {
    stats.examplesAdded += 1;
    reportUnknownExampleKeys(parsed.example, schema, host, (label ? label + ' ' : '') + parsed.code, stats);
  }
  return null;
}

function applyOperationTags(op, isSwagger2, stats, rootProduces, label, host) {
  for (const key of ['summary', 'description']) {
    applyOperationTagsIn(op, key, isSwagger2, stats, rootProduces, label, host);
  }
}

function requestExampleMime(op) {
  const content = op.requestBody && op.requestBody.content;
  const keys = content ? Object.keys(content) : [];
  return keys.length ? keys[0] : 'application/json';
}

// Named example cases live in content.<type>.examples, which only OpenAPI 3.x
// has. The whole media type object is returned so the caller can drop a plain
// example: the two fields are mutually exclusive and a file carrying both is
// rejected by validators.
function caseMediaType(op, parsed, isResponse, stats) {
  if (!isResponse) {
    if (!op.requestBody || typeof op.requestBody !== 'object') {
      return { error: 'the operation has no request body' };
    }
    if (op.requestBody.$ref) return { error: 'the request body is a $ref reference — edit the shared body instead' };
    const mime = requestExampleMime(op);
    if (!op.requestBody.content || typeof op.requestBody.content !== 'object') op.requestBody.content = {};
    if (!op.requestBody.content[mime] || typeof op.requestBody.content[mime] !== 'object') op.requestBody.content[mime] = {};
    return { media: op.requestBody.content[mime], at: 'request' };
  }
  if (!op.responses || typeof op.responses !== 'object') op.responses = {};
  let r = op.responses[parsed.code];
  if (r && typeof r === 'object' && r.$ref) {
    return { error: 'response ' + parsed.code + ' is a $ref reference — edit the shared response instead' };
  }
  if (!r || typeof r !== 'object') {
    r = { description: responseReason(parsed.code) };
    op.responses[parsed.code] = r;
    stats.responsesAdded += 1;
  }
  const mime = responseExampleMime(op, r);
  if (!r.content || typeof r.content !== 'object') r.content = {};
  if (!r.content[mime] || typeof r.content[mime] !== 'object') r.content[mime] = {};
  return { media: r.content[mime], at: parsed.code };
}

function applyCaseMarker(op, parsed, isResponse, isSwagger2, stats, host, label) {
  if (isSwagger2) {
    return 'named example cases need OpenAPI 3.x — Swagger 2.0 allows only one example per media type';
  }
  const spot = caseMediaType(op, parsed, isResponse, stats);
  if (spot.error) return spot.error;
  const media = spot.media;

  if (!media.examples || typeof media.examples !== 'object') media.examples = {};
  // OpenAPI 3.x rejects a media type carrying both, and asking for cases says
  // which one is wanted. Nothing to report: the marker did what it promised.
  delete media.example;
  const entry = {};
  if (parsed.summary) entry.summary = parsed.summary;
  entry.value = parsed.value;
  media.examples[parsed.name] = entry;
  stats.examplesAdded += 1;
  reportUnknownExampleKeys(parsed.value, media.schema, host,
    (label ? label + ' ' : '') + spot.at + ' [' + parsed.name + ']', stats);
  return null;
}

function applyResponseTags(op, tags, isSwagger2, stats, rootProduces, label, host) {
  const done = new Set();
  // [response:] first: a case may target a response the same note declares.
  for (const tag of tags) {
    if (String(tag.key).toLowerCase() !== 'response') continue;
    const parsed = parseResponseMarker(tag.raw);
    const problem = parsed.error || applyResponseMarker(op, parsed, isSwagger2, rootProduces, stats, host, label);
    if (problem) stats.notApplied.push({ path: label || 'operation', reason: problem });
    else done.add(tag);
  }
  for (const tag of tags) {
    const key = String(tag.key).toLowerCase();
    if (key !== 'requestcase' && key !== 'responsecase') continue;
    const isResponse = key === 'responsecase';
    const parsed = parseCaseMarker(tag.raw, isResponse);
    const problem = parsed.error || applyCaseMarker(op, parsed, isResponse, isSwagger2, stats, host, label);
    if (problem) stats.notApplied.push({ path: label || 'operation', reason: problem });
    else done.add(tag);
  }
  return done;
}

function applyOperationTagsIn(op, key, isSwagger2, stats, rootProduces, label, host) {
  const text = String(op[key] || '');
  if (text.indexOf('[') < 0) return;
  const tags = scanTags(text);
  const isResponse = (tag) => {
    const field = matchTagField(tag.key, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES);
    return field && (field.kind === 'response' || field.kind === 'case');
  };

  const responsesDone = applyResponseTags(op, tags.filter(isResponse), isSwagger2, stats, rootProduces, label, host);

  const applied = [];
  const assignedHere = [];
  for (const tag of tags.reverse()) {
    const field = matchTagField(tag.key, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES);
    if (!field) continue;
    if (field.kind === 'response' || field.kind === 'case') {
      if (!responsesDone.has(tag)) continue;
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
  applyMarkers, liftDescriptionTags,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
};
