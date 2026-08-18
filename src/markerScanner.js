const { refName } = require('./schemaShared');

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

    let i = valueEnd(text, from, true);
    if (i < 0) i = valueEnd(text, from, false);
    if (i < 0) continue;
    out.push({ key: m[1], raw: text.slice(from, i - 1).trim(), start: m.index, end: i });
    re.lastIndex = i;
  }
  return out;
}

function valueEnd(text, from, respectQuotes) {
  let depth = 1;
  let quoted = false;
  let i = from;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (quoted) {
      if (c === '\\') { i += 2; continue; }
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
  deprecated: 'flag',
  response: 'response'
};
const OPERATION_FIELD_NAMES = { operationid: 'operationId' };

const RESPONSE_REASONS = {
  '1XX': 'Informational', '2XX': 'Success', '3XX': 'Redirection',
  '4XX': 'Client error', '5XX': 'Server error', 'default': 'Default response',
  100: 'Continue', 101: 'Switching Protocols',
  200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content',
  301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified',
  307: 'Temporary Redirect', 308: 'Permanent Redirect',
  400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
  405: 'Method Not Allowed', 406: 'Not Acceptable', 408: 'Request Timeout',
  409: 'Conflict', 410: 'Gone', 412: 'Precondition Failed', 415: 'Unsupported Media Type',
  422: 'Unprocessable Entity', 423: 'Locked', 429: 'Too Many Requests',
  500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
  503: 'Service Unavailable', 504: 'Gateway Timeout'
};

function responseReason(code) {
  return RESPONSE_REASONS[code] || 'Response ' + code;
}

function normalizeResponseCode(token) {
  const t = String(token).trim();
  if (/^default$/i.test(t)) return 'default';
  if (/^[1-5]xx$/i.test(t)) return t[0] + 'XX';
  if (/^[1-5]\d\d$/.test(t)) return t;
  return null;
}

function quotedSpan(s) {
  let i = 1;
  while (i < s.length) {
    if (s[i] === '\\') { i += 2; continue; }
    if (s[i] === '"') return i + 1;
    i += 1;
  }
  return 0;
}

function jsonTailStart(s) {
  const brace = s.indexOf('{');
  const bracket = s.indexOf('[');
  const i = brace < 0 ? bracket : (bracket < 0 ? brace : Math.min(brace, bracket));
  if (i < 0) return s.length;
  try { JSON.parse(s.slice(i)); return i; } catch (e) { return s.length; }
}

function normalizeSchemaRef(token) {
  const m = String(token).match(/^#(?:\/(?:definitions|components\/schemas)\/)?([^/\s]+)$/);
  return m ? m[1] : null;
}

function parseResponseMarker(raw) {
  const text = String(raw === undefined ? '' : raw).trim();
  const m = text.match(/^(\S+)\s*/);
  const code = m && normalizeResponseCode(m[1]);
  if (!code) return { error: 'the value must start with a status code — 100-599, a range such as 4XX, or default' };
  let rest = text.slice(m[0].length).trim();
  let description;
  if (rest[0] === '"') {
    const span = quotedSpan(rest);
    if (span) {
      description = unquote(rest.slice(0, span));
      rest = rest.slice(span).trim();
    } else {
      description = rest;
      rest = '';
    }
  } else if (rest && rest[0] !== '{' && rest[0] !== '[' && rest[0] !== '#') {
    const hash = rest.search(/\s#/);
    const cut = Math.min(jsonTailStart(rest), hash < 0 ? rest.length : hash);
    description = rest.slice(0, cut).trim();
    rest = rest.slice(cut).trim();
  }
  let ref;
  if (rest[0] === '#') {
    const token = rest.match(/^(\S+)\s*/);
    ref = normalizeSchemaRef(token[1]);
    if (!ref) return { error: 'the body schema must look like #Name or #/components/schemas/Name' };
    rest = rest.slice(token[0].length).trim();
  }
  let example;
  if (rest) {
    try { example = JSON.parse(rest); }
    catch (e) { return { error: 'the example after the code is not valid JSON' }; }
  }
  return { code: code, description: description, ref: ref, example: example };
}

const FIELD_APPLIES_TO = {
  pattern: 'string', minLength: 'string', maxLength: 'string',
  minimum: 'number', maximum: 'number', multipleOf: 'number',
  exclusiveMinimum: 'number', exclusiveMaximum: 'number',
  minItems: 'array', maxItems: 'array', uniqueItems: 'array',
  minProperties: 'object', maxProperties: 'object'
};

function matchTagField(key, table, names) {
  const k = String(key).toLowerCase();
  if (k.startsWith('x-')) return { name: key, kind: 'json' };
  const kind = table[k];
  return kind ? { name: names[k] || k, kind } : null;
}

function isArraySchema(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.items) return true;
  const t = Array.isArray(schema.type) ? schema.type : [schema.type];
  return t.indexOf('array') >= 0;
}

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
    try { new RegExp(String(value)); } catch (e) { return false; }
  }
  const wants = FIELD_APPLIES_TO[name];
  if (!wants) return true;
  const kind = nodeKind(node, host);
  return kind === null || kind === wants;
}

function scalarType(schema) {
  const t = Array.isArray(schema.type) ? schema.type.filter((x) => x !== 'null')[0] : schema.type;
  if (t === 'string' || t === 'integer' || t === 'number' || t === 'boolean') return t;
  if (!t && schema.enum && schema.enum.length) return typeof schema.enum[0] === 'number' ? 'number' : 'string';
  return null;
}

function resolveScalarType(schema, host) {
  const direct = scalarType(schema);
  if (direct) return direct;
  const ref = host && schema && refName(schema.$ref);
  return ref && host[ref] ? scalarType(host[ref]) : null;
}

function coerceValue(raw, type) {
  if (raw === undefined) return undefined;

  if (raw === 'null') return null;
  const quoted = isQuoted(raw);
  if (type === 'string') return quoted ? unquote(raw) : raw;

  if (quoted && (type === 'integer' || type === 'number' || type === 'boolean')) return undefined;

  if (type === 'boolean') return boolValue(raw);

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

function boolValue(raw) {
  if (/^true$/i.test(raw)) return true;
  if (/^false$/i.test(raw)) return false;
  return undefined;
}

function isQuoted(raw) {
  return /^"[\s\S]*"$/.test(String(raw));
}

function unquote(raw) {
  const s = String(raw);
  if (!isQuoted(s)) return s;
  return s.slice(1, -1).replace(/\\(["\\])/g, '$1');
}

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

function jsonOrSplit(raw) {
  const t = String(raw).trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const v = JSON.parse(t);
      return Array.isArray(v) ? v : [v];
    } catch (e) {  }
  }
  return splitOutsideQuotes(t);
}

function coerceTagValue(kind, raw, node, host) {
  switch (kind) {

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

module.exports = {
  scanTags, tidyDescription,
  SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES,
  matchTagField, isArraySchema, fieldFitsNode,
  coerceValue, coerceTagValue, resolveScalarType,
  parseResponseMarker, responseReason
};
