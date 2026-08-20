const {
  scanTags, matchTagField, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES,
  coerceTagValue, parseResponseMarker, parseCaseMarker, responseReason
} = require('./markerScanner');
const { objectTarget, itemsTarget, modelExample, stripTagSpans } = require('./modelValues');

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

function requestExampleMime(op) {
  const content = op.requestBody && op.requestBody.content;
  const keys = content ? Object.keys(content) : [];
  return keys.length ? keys[0] : 'application/json';
}

function mediaEntry(holder, mime) {
  if (!holder.content || typeof holder.content !== 'object') holder.content = {};
  if (!holder.content[mime] || typeof holder.content[mime] !== 'object') holder.content[mime] = {};
  return holder.content[mime];
}

function caseMediaType(op, parsed, isResponse, stats) {
  if (!isResponse) {
    if (!op.requestBody || typeof op.requestBody !== 'object') {
      return { error: 'the operation has no request body' };
    }
    if (op.requestBody.$ref) return { error: 'the request body is a $ref reference — edit the shared body instead' };
    return { media: mediaEntry(op.requestBody, requestExampleMime(op)), at: 'request' };
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
  return { media: mediaEntry(r, responseExampleMime(op, r)), at: parsed.code };
}

function registerCaseOrder(order, media, name, number) {
  let group = order.get(media);
  if (!group) {
    group = { max: 0, entries: [] };
    order.set(media, group);
  }
  const at = group.entries.findIndex((e) => e.name === name);
  if (at >= 0) group.entries.splice(at, 1);
  const num = number || group.max + 1;
  if (num > group.max) group.max = num;
  group.entries.push({ name: name, num: num });
}

function sortCaseExamples(order) {
  for (const [media, group] of order) {
    const examples = media.examples;
    if (!examples || typeof examples !== 'object' || group.entries.length < 2) continue;
    const ranked = group.entries
      .map((e, i) => ({ name: e.name, num: e.num, i: i }))
      .sort((a, b) => (a.num - b.num) || (a.i - b.i));
    const managed = new Set(group.entries.map((e) => e.name));
    const sorted = {};
    for (const key of Object.keys(examples)) {
      if (!managed.has(key)) sorted[key] = examples[key];
    }
    for (const entry of ranked) sorted[entry.name] = examples[entry.name];
    media.examples = sorted;
  }
}

function applyCaseMarker(op, parsed, isResponse, isSwagger2, stats, host, label, order) {
  if (isSwagger2) {
    return 'named example cases need OpenAPI 3.x — Swagger 2.0 allows only one example per media type';
  }
  const spot = caseMediaType(op, parsed, isResponse, stats);
  if (spot.error) return spot.error;
  const media = spot.media;

  let value = parsed.value;
  if (parsed.fromModel) {
    const schema = parsed.ref ? (host && host[parsed.ref]) : media.schema;
    if (parsed.ref && !schema) return 'the model schema ' + parsed.ref + ' does not exist in the file';
    if (!schema) return 'the case ' + parsed.name + ' has nothing to build from — the media type carries no schema';
    value = modelExample(schema, host, new Set(), parsed.requiredOnly);
    if (value === undefined) {
      return parsed.requiredOnly
        ? 'the case ' + parsed.name + ' would come out empty — no required field in the model carries an example'
        : 'the case ' + parsed.name + ' would come out empty — no field in the model carries an example';
    }
  }

  if (!media.examples || typeof media.examples !== 'object') media.examples = {};
  delete media.example;
  const entry = {};
  if (parsed.summary) entry.summary = parsed.summary;
  entry.value = value;
  media.examples[parsed.name] = entry;
  registerCaseOrder(order, media, parsed.name, parsed.order);
  stats.examplesAdded += 1;
  reportUnknownExampleKeys(value, media.schema, host,
    (label ? label + ' ' : '') + spot.at + ' [' + parsed.name + ']', stats);
  return null;
}

function recordOutcome(problem, tag, done, stats, label) {
  if (problem) stats.notApplied.push({ path: label || 'operation', reason: problem });
  else done.add(tag);
}

function applyResponseTags(op, tags, isSwagger2, stats, rootProduces, label, host, order) {
  const done = new Set();
  const named = (tag, key) => String(tag.key).toLowerCase() === key;

  for (const tag of tags.filter((t) => named(t, 'response'))) {
    const parsed = parseResponseMarker(tag.raw);
    recordOutcome(parsed.error || applyResponseMarker(op, parsed, isSwagger2, rootProduces, stats, host, label),
      tag, done, stats, label);
  }
  for (const tag of tags.filter((t) => named(t, 'requestcase') || named(t, 'responsecase'))) {
    const isResponse = named(tag, 'responsecase');
    const parsed = parseCaseMarker(tag.raw, isResponse);
    recordOutcome(parsed.error || applyCaseMarker(op, parsed, isResponse, isSwagger2, stats, host, label, order),
      tag, done, stats, label);
  }
  return done;
}

function applyOperationTagsIn(op, key, isSwagger2, stats, rootProduces, label, host, order) {
  const text = String(op[key] || '');
  if (text.indexOf('[') < 0) return;
  const tags = scanTags(text);
  const isResponse = (tag) => {
    const field = matchTagField(tag.key, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES);
    return field && (field.kind === 'response' || field.kind === 'case');
  };

  const responsesDone = applyResponseTags(op, tags.filter(isResponse), isSwagger2, stats, rootProduces, label, host, order);

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

function applyOperationTags(op, isSwagger2, stats, rootProduces, label, host) {
  const order = new Map();
  for (const key of ['summary', 'description']) {
    applyOperationTagsIn(op, key, isSwagger2, stats, rootProduces, label, host, order);
  }
  sortCaseExamples(order);
}

module.exports = { applyOperationTags };
