const { refName, schemaHost } = require('./schemaShared');
const {
  scanTags, tidyDescription, matchTagField,
  SCHEMA_TAG_FIELDS, SCHEMA_FIELD_NAMES, OPERATION_TAG_FIELDS, OPERATION_FIELD_NAMES,
  isArraySchema, coerceTagValue
} = require('./markerScanner');

function jsonList(raw) {
  const t = String(raw === undefined ? '' : raw).trim();
  if (t[0] !== '[') return null;
  try {
    const v = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch (e) { return null; }
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

function resolveRef(node, host) {
  return (node.$ref && host && host[refName(node.$ref)]) || null;
}

function objectTarget(node, host, seen) {
  if (!node || typeof node !== 'object') return null;
  if (node.properties) return node;
  const visited = seen || new Set();
  if (visited.has(node)) return null;
  visited.add(node);
  const named = resolveRef(node, host);

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
  const named = resolveRef(node, host);
  return named && named.items ? named.items : null;
}

function collectProperties(node, host, out, seen) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  const named = resolveRef(node, host);
  if (named) collectProperties(named, host, out, seen);
  for (const part of node.allOf || []) collectProperties(part, host, out, seen);
  for (const [key, prop] of Object.entries(node.properties || {})) {
    if (!(key in out)) out[key] = prop;
  }
}

function collectRequired(node, host, out, seen) {
  if (!node || typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  const named = resolveRef(node, host);
  if (named) collectRequired(named, host, out, seen);
  for (const part of node.allOf || []) collectRequired(part, host, out, seen);
  for (const key of node.required || []) out.add(key);
  return out;
}

function taggedListValue(node) {
  const tag = findTag(node, 'example');
  return tag ? jsonList(tag.raw) : null;
}

function modelExampleIn(node, host, seen, requiredOnly) {
  const own = node.example !== undefined ? node.example : exampleTagValue(node);
  if (own !== undefined) {
    return isArraySchema(node) && own !== null && !Array.isArray(own) ? [own] : own;
  }

  const items = itemsTarget(node, host);
  if (items) {
    const listOnItem = isArraySchema(items) ? null : taggedListValue(items);
    if (listOnItem) return listOnItem;
    const row = modelExample(items, host, seen, requiredOnly);
    if (row === undefined) return undefined;
    return Array.isArray(row) && !isArraySchema(items) ? row : [row];
  }
  const named = resolveRef(node, host);
  if (named) return modelExample(named, host, seen, requiredOnly);

  const props = {};
  collectProperties(node, host, props, new Set());
  const required = requiredOnly ? collectRequired(node, host, new Set(), new Set()) : null;
  const out = {};
  for (const [key, prop] of Object.entries(props)) {
    if (required && !required.has(key)) continue;
    const value = modelExample(prop, host, seen, requiredOnly);
    if (value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function modelExample(node, host, seen, requiredOnly) {
  if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
  seen.add(node);
  const value = modelExampleIn(node, host, seen, requiredOnly);
  seen.delete(node);
  return value;
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

function findTag(node, wanted) {
  for (const tag of scanTags(String((node && node.description) || ''))) {
    if (String(tag.key).toLowerCase() === wanted) return tag;
  }
  return null;
}

function taggedFieldValue(schema, wanted) {
  const tag = findTag(schema, wanted);
  return tag ? coerceTagValue('example', tag.raw, schema || {}) : undefined;
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

module.exports = {
  schemaHost, jsonList, wrapRefForSiblings, resolveRef, objectTarget, itemsTarget,
  collectProperties, collectRequired, modelExample, stripTagSpans,
  findTag, exampleTagValue, defaultTagValue, stripDescriptionTags
};
