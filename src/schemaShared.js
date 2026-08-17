
function schemaHost(spec) {
  return (spec && (spec.definitions || (spec.components && spec.components.schemas))) || {};
}

function refName(ref) {
  const m = typeof ref === 'string' && ref.match(/#\/(?:definitions|components\/schemas)\/([^/]+)$/);
  return m ? m[1] : null;
}

function plainType(s) {
  if (!s || typeof s !== 'object') return '?';
  if (s.$ref) return refName(s.$ref) || s.$ref;
  if (s.type === 'array') return plainType(s.items) + '[]';
  const t = Array.isArray(s.type) ? s.type.filter((x) => x !== 'null').join('|') || 'any' : (s.type || 'object');
  return s.format ? t + ' (' + s.format + ')' : t;
}

function firstResponseSchema(op) {
  const responses = op.responses || {};
  const code = ['200', '201', '202', 'default'].find((c) => responses[c]) || Object.keys(responses)[0];
  const r = code && responses[code];
  if (!r) return null;
  if (r.schema) return r.schema;
  const content = r.content || {};
  const media = Object.keys(content)[0];
  return media ? content[media].schema : null;
}

module.exports = { schemaHost, refName, plainType, firstResponseSchema };
