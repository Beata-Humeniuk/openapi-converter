// Filling in a Swagger/OpenAPI contract from tags in descriptions +
// deterministic examples — everything comes from data already in the file.
//
// UNIVERSAL TAG RULE: an element `[key: value]` (or a `[key]` flag) inside a
// description whose key is an OpenAPI field valid in that spot is treated as
// that field, not as prose — the value lands in the field and the tag
// disappears from the description. A key outside the field list (e.g.
// "[TODO: ...]", "[0..1]") stays in the description untouched. Spelling is
// exact (no typo tolerance; case-insensitive). Descriptions come from notes
// in EA, so the values live in the MODEL and survive every regeneration.
//
//   - schema/parameter fields: example, default, format, pattern, enum,
//     minimum/maximum/multipleOf, minLength/maxLength, minItems/maxItems,
//     minProperties/maxProperties, exclusiveMinimum/exclusiveMaximum,
//     nullable, deprecated, readOnly, writeOnly, uniqueItems, title,
//   - operations: operationId, summary, tags, consumes, produces, deprecated
//     (consumes/produces: operation fields in Swagger 2.0, in OpenAPI 3.x
//     a re-keying of media types in requestBody.content / responses),
//   - everywhere: [x-anything: value] → vendor extension 1:1.
//
// A tag is an explicit instruction from the model, so it WINS over a field
// value inserted by a generator; removing the tag from the description keeps
// the command idempotent.
//
// The extension does NOT invent values. A field with no tag and no value in
// the model stays empty — what to show is then up to the tool reading the
// contract (Swagger UI will use enum, default, format or its own
// placeholder). This way everything in the file comes from the model.

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
const { refName } = require('./schemaShared');

// --- scanner for [key: value] / [key] tags ---

// Returns [{ key, raw, start, end }]; raw === undefined for a value-less flag.
// The value is read with balanced brackets, so JSON with arrays
// ([example:{"a":[1]}]) works; an unclosed tag is ignored.
// Brackets and commas inside QUOTES do not count — this lets a text value
// contain `]`, `[` and `,`: [example: "a]b, c"].
function scanTags(text) {
  const out = [];
  const re = /\[\s*([A-Za-z][A-Za-z0-9-]*)\s*(:|\])/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[2] === ']') {
      out.push({ key: m[1], raw: undefined, start: m.index, end: m.index + m[0].length });
      continue;
    }
    const from = m.index + m[0].length;
    // First read respecting quotes (then a `]` inside the text does not end
    // the tag). An unbalanced quote — e.g. [example: "5" cala"] — would then
    // swallow the rest of the description, so we retry with brackets only.
    // The second attempt breaks nothing: it only runs where the first failed.
    let i = valueEnd(text, from, true);
    if (i < 0) i = valueEnd(text, from, false);
    if (i < 0) continue; // unclosed — we do not guess
    out.push({ key: m[1], raw: text.slice(from, i - 1).trim(), start: m.index, end: i });
    re.lastIndex = i;
  }
  return out;
}

// Index PAST the closing `]`, or -1 when the tag never closes.
function valueEnd(text, from, respectQuotes) {
  let depth = 1;
  let quoted = false;
  let i = from;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') { i += 2; continue; } // \" does not end the text
      if (c === '"') quoted = false;
    } else if (respectQuotes && c === '"') quoted = true;
    else if (c === '[') depth += 1;
    else if (c === ']') depth -= 1;
    i += 1;
  }
  return depth > 0 ? -1 : i;
}

function tidyDescription(text) {
  const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  while (lines.length && !lines[0]) lines.shift();
  return lines.filter((l, idx) => l || (lines[idx - 1] || '').length).join('\n');
}

// OpenAPI fields allowed in tags, with the kind of value each takes.
// Deliberately WITHOUT structural fields (type, required, properties, items,
// $ref, security…) — those belong to the EA model itself, not to a note.
const SCHEMA_TAG_FIELDS = {
  example: 'example',
  default: 'example',
  examplebody: 'spread',
  format: 'string',
  pattern: 'string',
  title: 'string',
  enum: 'list',
  minimum: 'number',
  maximum: 'number',
  multipleof: 'number',
  minlength: 'number',
  maxlength: 'number',
  minitems: 'number',
  maxitems: 'number',
  minproperties: 'number',
  maxproperties: 'number',
  exclusiveminimum: 'boolOrNumber',
  exclusivemaximum: 'boolOrNumber',
  nullable: 'flag',
  deprecated: 'flag',
  readonly: 'flag',
  writeonly: 'flag',
  uniqueitems: 'flag'
};
// normalized (lowercase) key → the canonical spelling of the field in the file
const SCHEMA_FIELD_NAMES = {
  multipleof: 'multipleOf', minlength: 'minLength', maxlength: 'maxLength',
  minitems: 'minItems', maxitems: 'maxItems',
  minproperties: 'minProperties', maxproperties: 'maxProperties',
  exclusiveminimum: 'exclusiveMinimum', exclusivemaximum: 'exclusiveMaximum',
  readonly: 'readOnly', writeonly: 'writeOnly', uniqueitems: 'uniqueItems'
};

const OPERATION_TAG_FIELDS = {
  operationid: 'string',
  summary: 'string',
  tags: 'stringList',
  consumes: 'stringList',
  produces: 'stringList',
  deprecated: 'flag'
};
const OPERATION_FIELD_NAMES = { operationid: 'operationId' };

// A field that describes a TYPE makes no sense outside of it. `pattern` on a
// number is a dead entry (in JSON Schema a pattern applies only to strings) —
// the contract generator will ignore it while the modeller stays convinced the
// constraint works. Such a tag stays in the description, visible, instead of
// soaking silently into the file.
const FIELD_APPLIES_TO = {
  pattern: 'string', minLength: 'string', maxLength: 'string',
  minimum: 'number', maximum: 'number', multipleOf: 'number',
  exclusiveMinimum: 'number', exclusiveMaximum: 'number',
  minItems: 'array', maxItems: 'array', uniqueItems: 'array',
  minProperties: 'object', maxProperties: 'object'
};

// null = unknown (e.g. a bare $ref we cannot resolve) — then nothing is
// blocked, because blocking on a guess would be worse than writing.
function nodeKind(schema, host) {
  const scalar = resolveScalarType(schema, host);
  if (scalar) return scalar === 'integer' ? 'number' : scalar;
  if (isArraySchema(schema)) return 'array';
  const declared = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (declared.indexOf('object') >= 0 || schema.properties) return 'object';
  return null;
}

function fieldFitsNode(name, value, node, host) {
  if (name === 'pattern') {
    try { new RegExp(String(value)); } catch (e) { return false; } // broken regex
  }
  const wants = FIELD_APPLIES_TO[name];
  if (!wants) return true;
  const kind = nodeKind(node, host);
  return kind === null || kind === wants;
}

function matchTagField(key, table, names) {
  const k = String(key).toLowerCase();
  if (k.startsWith('x-')) return { name: key, kind: 'json' };
  const kind = table[k];
  return kind ? { name: names[k] || k, kind } : null;
}

// --- value coercion ---

function scalarType(schema) {
  const t = Array.isArray(schema.type) ? schema.type.filter((x) => x !== 'null')[0] : schema.type;
  if (t === 'string' || t === 'integer' || t === 'number' || t === 'boolean') return t;
  if (!t && schema.enum && schema.enum.length) return typeof schema.enum[0] === 'number' ? 'number' : 'string';
  return null;
}

// A field written as a bare $ref (typical for a shared EA type, e.g.
// measuredValue.value) has no `type` of its own — without resolving the
// reference a tag value on such a field would coerce blindly (e.g. "1" → a
// number instead of a textual code). host is definitions/components.schemas.
function resolveScalarType(schema, host) {
  const direct = scalarType(schema);
  if (direct) return direct;
  const ref = host && schema && refName(schema.$ref);
  return ref && host[ref] ? scalarType(host[ref]) : null;
}

// "0012" in a string field stays the string "0012"; in a number field it is a number.
function coerceValue(raw, type) {
  if (raw === undefined) return undefined;
  // A bare `null` means JSON null regardless of the field type — otherwise on
  // a string field it would become the literal text "null" instead of a real
  // absence of value. Whoever truly wants the text quotes it: [example: "null"].
  if (raw === 'null') return null;
  const quoted = isQuoted(raw);
  if (type === 'string') return quoted ? unquote(raw) : raw;
  // Quotes are an explicit "this is text" declaration. On a numeric or boolean
  // field such a value does not fit the type — the tag stays in the
  // description instead of putting a string where the contract promises a number.
  if (quoted && (type === 'integer' || type === 'number' || type === 'boolean')) return undefined;
  // A boolean field accepts only true/false — exactly as they will appear in
  // the resulting file. Anything else (a number, text, a word in another
  // language) is not a boolean value, so the tag stays in the description.
  if (type === 'boolean') return boolValue(raw);
  // A numeric field accepts a number written the way the file will write it:
  // decimal point, no currency, no spaces. Anything else stays in the
  // description — it used to soak into the contract as text in a number field.
  if (type === 'integer' || type === 'number') {
    const t = String(raw).trim();
    const n = Number(t);
    if (!t || isNaN(n)) return undefined;
    return type === 'integer' && !Number.isInteger(n) ? undefined : n;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return raw;
  }
}

// true/false (case-insensitive) or undefined — we do not guess.
function boolValue(raw) {
  if (/^true$/i.test(raw)) return true;
  if (/^false$/i.test(raw)) return false;
  return undefined;
}

// Inside quotes we resolve EXACTLY two escapes: `\"` to a quote in the text
// and `\\` to a single backslash. Nothing more — full JSON rules would
// silently turn the path "C:\raporty" into text with a carriage return
// (`\r`), and an EA note is hand-written text, not a code literal.
function isQuoted(raw) {
  return /^"[\s\S]*"$/.test(String(raw));
}

function unquote(raw) {
  const s = String(raw);
  if (!isQuoted(s)) return s;
  return s.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

// Split on commas outside quotes: ["A,B", "C"] is two entries.
function splitOutsideQuotes(text) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') { cur += c + (text[i + 1] || ''); i += 1; continue; }
      if (c === '"') quoted = false;
      cur += c;
      continue;
    }
    if (c === '"') { quoted = true; cur += c; continue; }
    if (c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// A list: JSON ([enum: ["A","B"]]) or comma-separated values ([enum: A, B]).
function jsonOrSplit(raw) {
  const t = String(raw).trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : [v];
    } catch (e) { /* not JSON — treat as a comma-separated list */ }
  }
  return splitOutsideQuotes(t);
}

// A field written as a bare `$ref` (a type from a shared model that must not
// be touched) does not accept values next to the reference: in Swagger 2.0
// and OpenAPI 3.0 siblings of `$ref` are IGNORED, so example/description
// written beside it look applied while no tool will ever show them. The
// standard workaround is a single-element allOf — the reference stays a
// reference and the values from the note start to apply. In 3.1 siblings are
// legal, so there we leave the structure alone.
function refSiblingsIgnored(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.swagger === '2.0') return true;
  const v = parseFloat(String(spec.openapi || ''));
  return !isNaN(v) && v < 3.1;
}

// Returns true when THIS pass wrapped the node (counted in the report).
function wrapRefForSiblings(node) {
  if (!node || typeof node !== 'object' || !node.$ref) return false;
  const ref = node.$ref;
  delete node.$ref;
  const rest = Object.assign({}, node);
  for (const key of Object.keys(node)) delete node[key];
  node.allOf = [{ $ref: ref }];       // allOf first — reads better in a diff
  Object.assign(node, rest);
  return true;
}

// undefined = the value does not fit the field's kind — the tag stays in the
// description, visible to a human, instead of writing something broken.
// host (optional) resolves the type of a field written as a bare $ref
// (see resolveScalarType).
function coerceTagValue(kind, raw, node, host) {
  switch (kind) {
    // A value-less flag means true; with a value it accepts only true/false.
    // Previously anything but "false" produced true, so a typo in the value
    // switched the flag on instead of standing out.
    case 'flag':
      return raw === undefined ? true : boolValue(raw);
    case 'number': {
      const n = Number(String(raw));
      return isNaN(n) ? undefined : n;
    }
    case 'boolOrNumber': {
      const b = boolValue(raw);
      if (b !== undefined) return b;
      const n = Number(String(raw));
      return isNaN(n) ? undefined : n;
    }
    case 'string':
      return raw === undefined ? undefined : unquote(raw);
    case 'stringList':
      return raw === undefined ? undefined : jsonOrSplit(raw).map((v) => unquote(String(v)));
    case 'list': {
      if (raw === undefined) return undefined;
      const t = resolveScalarType(node, host);
      const items = jsonOrSplit(raw).map((v) => (typeof v === 'string' ? coerceValue(v, t) : v));
      // If even one entry does not fit the type (e.g. "1" in a numeric enum),
      // the whole tag stays in the description — half a list would be worse
      // than nothing.
      return items.some((v) => v === undefined) ? undefined : items;
    }
    case 'example':
      return coerceValue(raw, resolveScalarType(node, host));
    case 'json':
      if (raw === undefined) return true;
      try { return JSON.parse(raw); } catch (e) { return unquote(raw); }
    default:
      return undefined;
  }
}

// --- moving tags into fields ---

function isArraySchema(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.items) return true;
  const t = Array.isArray(schema.type) ? schema.type : [schema.type];
  return t.indexOf('array') >= 0;
}

// An array parsed from JSON, or null when the value is not a list.
function jsonList(raw) {
  const t = String(raw === undefined ? '' : raw).trim();
  if (t[0] !== '[') return null;
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
}

// An example lands where its SHAPE fits, not where the note happened to land.
// EA attaches the note of an attribute with multiplicity 0..* to the ELEMENT
// type, so [example: ["RQST"]] used to hit a string and stay the literal text
// `["RQST"]` (in the payload: ["[\"RQST\"]"]). Therefore:
//   - a list written on an element goes to the array (arrayOf),
//   - a single value written on an array becomes a one-element list
//     — an array's `example` must be an array, otherwise the contract is invalid.
// An explicit null stays null (see coerceValue).
// An element that ITSELF is an array (a list of lists) keeps the list.
// Returns { target, value } or undefined when the value does not fit the type.
// The placement is decided BEFORE coercion: a list written in an element's
// note belongs to the array and must be read as a whole, not through the
// element type (otherwise ["10","20"] on an integer element would fail as
// "not a number").
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

// Spreading an object example ONTO FIELDS. An EA note usually carries a ready
// chunk of payload attached to one field; keeping it whole gives one big
// `example` on top instead of examples on individual fields. So the value is
// spread: key by key, deep down, all the way to the leaves.
//
// A key absent from the structure is NOT inserted — it goes to the unknown
// list (usually a typo, or a field the model does not have). An array with a
// single element spreads onto `items`; an array with several stays whole on
// the field, because a single element cannot express two rows.
function parseJsonValue(raw) {
  const s = String(raw === undefined ? '' : raw).trim();
  if (s[0] !== '{' && s[0] !== '[') return undefined;
  try { return JSON.parse(s); } catch (e) { return undefined; }
}

// Input for [exampleBody:]: an object is spread over fields, an array of
// objects over the fields of the element. The example's shape does not have
// to match the field's shape — an object written for a list describes one
// row, and a one-element list written for an object is that object.
// Returns null or the reason for failure.
function spreadPayload(node, parsed, host, wrapRefs, stats) {
  const items = itemsTarget(node, host);
  const rows = Array.isArray(parsed) ? parsed.filter((v) => v && typeof v === 'object' && !Array.isArray(v)) : null;

  if (items) {                                    // the field is a list
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

// Besides being spread over fields, the example also lands WHOLE on the field
// itself. Without this, a payload-assembling tool would draw in fields the
// example does not have — and a field missing from [exampleBody:] is a
// decision, not an oversight. The value on the field wins over values below
// it, so the payload shows exactly what the note says.
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
  // A named type can itself be a composition (allOf), so we descend into it.
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

// Returns the ACCEPTED part of the example (without keys the model does not
// have) or null when nothing could be accepted. The accepted part then lands
// whole on the field, so nothing outside the model reaches the file.
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

// key: the field the tags were read from (description by default; for
// operations also summary).
function stripTagSpans(node, text, applied, key) {
  if (!applied.length) return;
  const field = key || 'description';
  let out = text;
  for (const tag of applied) out = out.slice(0, tag.start) + out.slice(tag.end);
  const cleaned = tidyDescription(out);
  if (cleaned) node[field] = cleaned;
  else delete node[field];
}

// Schema fields / Swagger 2.0 non-body parameters (isSwagger2Param:
// example goes into x-example, because 2.0 has no example on a parameter).
// host (definitions/components.schemas) allows correct coercion of tags on
// fields written as a bare $ref (see resolveScalarType). Returns
// { setValue: bool } — true when THIS pass set example/x-example from a tag
// (even to null or an empty array).
function applyFieldTags(node, stats, isSwagger2, isSwagger2Param, host, arrayOf, wrapRefs, path) {
  const text = String(node.description || '');
  if (text.indexOf('[') < 0) return { setValue: false };
  const applied = [];
  let setValue = false;
  for (const tag of scanTags(text).reverse()) {
    const field = matchTagField(tag.key, SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES);
    if (!field) continue;
    // [exampleBody: {...}] — a ready chunk of payload SPREAD over fields, each
    // getting its own example. The only tag that reaches deep into the structure.
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
      setValue = true;
      continue;
    }
    // example/default carry a data value — those go to the array or to the
    // element depending on shape (see placeExample). The remaining fields
    // (format, pattern, minLength…) describe THIS node and stay in place.
    let placed;
    if (field.kind === 'example') {
      placed = placeExample(tag.raw, node, arrayOf, host);
    } else {
      const v = coerceTagValue(field.kind, tag.raw, node, host);
      placed = v === undefined ? undefined : { target: node, value: v };
    }
    if (placed === undefined) continue;
    const value = placed.value;
    // A tag that does not fit this field stays in the description — the same
    // as a value that does not fit the field's kind (see coerceTagValue).
    if (!fieldFitsNode(field.name, value, placed.target, host)) continue;
    // A value next to a bare reference would be dead — first make room for
    // it, only then write.
    if (wrapRefs && wrapRefForSiblings(placed.target)) stats.refsWrapped += 1;
    let name = field.name;
    if (name === 'example' && isSwagger2Param) name = 'x-example';
    if (name === 'nullable' && isSwagger2) name = 'x-nullable';
    placed.target[name] = value;
    applied.push(tag);
    stats.tagFields += 1;
    // setValue is about THIS node: when the example went to the array, the
    // element is left without a value and the generator may add its own (e.g.
    // from pattern). Otherwise the first pass would not add it and the second
    // would — and the command would stop being idempotent.
    if (name === 'example' || name === 'x-example') {
      stats.examplesAdded += 1;
      stats.fromTags += 1;
      setValue = setValue || placed.target === node;
    }
    else if (name === 'default') stats.defaultsAdded += 1;
  }
  stripTagSpans(node, text, applied);
  return { setValue: setValue };
}

// In OpenAPI 3.x consumes/produces are not fields — they re-key the media
// types in content (schemas stay).
function rekeyContent(content, mimes) {
  const keys = Object.keys(content || {});
  if (!keys.length) return null; // no content — nothing to re-key
  const out = {};
  for (const m of mimes) out[m] = content[m] || content[keys[0]];
  return out;
}

// Operation tags are read from description AND from summary: in EA these are
// two different note fields and values like [consumes:]/[produces:] end up in
// either. We scan both; a tag disappears from the field it was written in.
function applyOperationTags(op, isSwagger2, stats) {
  for (const key of ['summary', 'description']) applyOperationTagsIn(op, key, isSwagger2, stats);
}

function applyOperationTagsIn(op, key, isSwagger2, stats) {
  const text = String(op[key] || '');
  if (text.indexOf('[') < 0) return;
  const applied = [];
  const assignedHere = [];
  for (const tag of scanTags(text).reverse()) {
    const field = matchTagField(tag.key, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES);
    if (!field) continue;
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
  // [summary: "X"] written IN summary: cleaning the text would overwrite the
  // just-inserted value, so we put it back.
  if (assignedHere.length) op[key] = assignedHere[0];
}

// --- helpers for specData (Word/md without running the commands) ---

function taggedFieldValue(schema, wanted) {
  for (const tag of scanTags(String((schema && schema.description) || ''))) {
    if (String(tag.key).toLowerCase() !== wanted) continue;
    return coerceTagValue('example', tag.raw, schema || {});
  }
  return undefined;
}

function exampleTagValue(schema) { return taggedFieldValue(schema, 'example'); }
function defaultTagValue(schema) { return taggedFieldValue(schema, 'default'); }

// A description to show a human: without field tags (metadata), the rest untouched.
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

// --- walking the specification ---

// visit(node, name, path, exampleKey, arrayOf) — exampleKey is 'x-example'
// for a Swagger 2.0 non-body parameter, otherwise undefined; arrayOf is the
// schema of the array this node is an element of (items only), so an example
// written in the element's note can land on the array.
function walkSchema(schema, name, path, visit, seen, arrayOf) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  if (seen.has(schema)) return;
  seen.add(schema);
  // Even when the field is a $ref, its OWN description (e.g. an EA note
  // attached to this particular use of a shared type, not to the type
  // itself) may carry an [example:]/[format:]/... tag — it must be read
  // before returning without descending further (the structure belongs to
  // the named schema in definitions/schemas, visited separately).
  visit(schema, name, path, undefined, arrayOf);
  if (schema.$ref) return;
  for (const [key, p] of Object.entries(schema.properties || {})) {
    walkSchema(p, key, path + '.' + key, visit, seen);
  }
  if (schema.items) walkSchema(schema.items, name, path + '[]', visit, seen, schema);
  for (const part of schema.allOf || []) walkSchema(part, name, path, visit, seen);
  for (const part of schema.oneOf || []) walkSchema(part, name, path, visit, seen);
  for (const part of schema.anyOf || []) walkSchema(part, name, path, visit, seen);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    walkSchema(schema.additionalProperties, name, path + '.*', visit, seen);
  }
}

function walkParameters(params, isSwagger2, pathLabel, visit, seen) {
  for (const p of params || []) {
    if (!p || typeof p !== 'object' || p.$ref) continue;
    const label = pathLabel + '(' + (p.name || '?') + ')';
    if (p.schema) walkSchema(p.schema, p.name, label, visit, seen);
    else if (isSwagger2 && p.in !== 'body') visit(p, p.name, label, 'x-example');
  }
}

function walkContent(content, name, pathLabel, visit, seen) {
  for (const media of Object.values(content || {})) {
    if (media && media.schema) walkSchema(media.schema, name, pathLabel, visit, seen);
  }
}

// Visits every field of the contract exactly once: named schemas, parameters,
// request bodies and responses (inline schemas; $refs at their own homes).
function walkSpec(spec, visit) {
  if (!spec || typeof spec !== 'object') return;
  const isSwagger2 = spec.swagger === '2.0';
  const seen = new Set();
  const host = (spec.definitions || (spec.components && spec.components.schemas)) || {};
  for (const [name, schema] of Object.entries(host)) {
    walkSchema(schema, name, name, visit, seen);
  }
  for (const [route, item] of Object.entries(spec.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    walkParameters(item.parameters, isSwagger2, route, visit, seen);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || typeof op !== 'object') continue;
      const label = method.toUpperCase() + ' ' + route;
      walkParameters(op.parameters, isSwagger2, label, visit, seen);
      if (op.requestBody) walkContent(op.requestBody.content, 'body', label + ' body', visit, seen);
      for (const [code, r] of Object.entries(op.responses || {})) {
        if (!r || typeof r !== 'object') continue;
        if (r.schema) walkSchema(r.schema, 'response', label + ' ' + code, visit, seen);
        walkContent(r.content, 'response', label + ' ' + code, visit, seen);
      }
    }
  }
}

function walkOperations(spec, visit) {
  if (!spec || typeof spec !== 'object') return;
  for (const item of Object.values(spec.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (item[method] && typeof item[method] === 'object') visit(item[method]);
    }
  }
}

function newStats() {
  return { examplesAdded: 0, defaultsAdded: 0, fromTags: 0, mediaSet: 0, tagFields: 0, refsWrapped: 0, mismatched: [], unknownKeys: [], notApplied: [] };
}

// A field that has both a pattern and an example checks itself: an example
// that does NOT match the pattern means one of the two is wrong. The most
// common cause is doubled backslashes in an EA note — `\\d` in a regex means
// "a backslash, then the letter d", not a digit, so it matches no number.
// Nothing is fixed here (we do not guess which of the two is wrong) — the
// field is listed at the end so it can be seen.
function checkPatternAgainstExample(node, path, stats) {
  if (!node.pattern || typeof node.example !== 'string') return;
  let re;
  try { re = new RegExp(node.pattern); } catch (e) { return; }
  if (!re.test(node.example)) stats.mismatched.push(path);
}

// The name used by version conversion: moving markers before switching to a
// different Swagger/OpenAPI version, so values from notes do not get lost.
function liftDescriptionTags(spec) {
  return applyMarkers(spec);
}

// Moves markers from descriptions into OpenAPI fields IN PLACE; returns stats.
// It invents NOTHING: a field with no marker and no value in the model stays
// empty, and what it looks like in Swagger UI is up to Swagger UI — enum,
// default, format or its own placeholder. The extension adds only what the
// note says. Deterministic and idempotent.
function applyMarkers(spec) {
  const stats = newStats();
  if (!spec || typeof spec !== 'object') return stats;
  const isSwagger2 = spec.swagger === '2.0';
  const host = (spec.definitions || (spec.components && spec.components.schemas)) || {};
  walkOperations(spec, (op) => applyOperationTags(op, isSwagger2, stats));
  const wrapRefs = refSiblingsIgnored(spec);
  walkSpec(spec, (node, name, path, exampleKey, arrayOf) => {
    applyFieldTags(node, stats, isSwagger2, exampleKey === 'x-example', host, arrayOf, wrapRefs, path);
    // A field with both a pattern and an example checks itself — no matter
    // whether the example came from a marker or was already in the model.
    checkPatternAgainstExample(node, path, stats);
  });
  return stats;
}

module.exports = {
  applyMarkers, liftDescriptionTags,
  scanTags, stripDescriptionTags, exampleTagValue, defaultTagValue, coerceValue
};
