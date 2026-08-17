function schemaHost(spec) {
  return (spec && (spec.definitions || (spec.components && spec.components.schemas))) || {};
}

function refName(ref) {
  const m = typeof ref === 'string' && ref.match(/#\/(?:definitions|components\/schemas)\/([^/]+)$/);
  return m ? m[1] : null;
}

module.exports = { schemaHost, refName };
