const { schemaHost } = require('./schemaShared');

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];

function walkSchema(schema, path, visit, seen, arrayOf) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return;
  if (seen.has(schema)) return;
  seen.add(schema);

  visit(schema, path, undefined, arrayOf);
  if (schema.$ref) return;
  for (const [key, p] of Object.entries(schema.properties || {})) {
    walkSchema(p, path + '.' + key, visit, seen);
  }
  if (schema.items) walkSchema(schema.items, path + '[]', visit, seen, schema);
  for (const part of schema.allOf || []) walkSchema(part, path, visit, seen);
  for (const part of schema.oneOf || []) walkSchema(part, path, visit, seen);
  for (const part of schema.anyOf || []) walkSchema(part, path, visit, seen);
  if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    walkSchema(schema.additionalProperties, path + '.*', visit, seen);
  }
}

function parameterSchema(p) {
  if (p.schema && typeof p.schema === 'object') return p.schema;
  const media = Object.values(p.content || {})[0];
  return media && typeof media.schema === 'object' ? media.schema : null;
}

function walkParameters(params, isSwagger2, pathLabel, visit, seen) {
  for (const p of params || []) {
    if (!p || typeof p !== 'object' || p.$ref) continue;
    const label = pathLabel + '(' + (p.name || '?') + ')';
    if (p.schema) walkSchema(p.schema, label, visit, seen);
    else if (p.content) walkContent(p.content, label, visit, seen);
    else if (isSwagger2 && p.in !== 'body') { visit(p, label, 'x-example'); continue; }
    if (isSwagger2) continue;
    const schema = parameterSchema(p);
    if (schema) visit(schema, label, undefined, undefined, p);
  }
}

function walkContent(content, pathLabel, visit, seen) {
  for (const media of Object.values(content || {})) {
    if (media && media.schema) walkSchema(media.schema, pathLabel, visit, seen);
  }
}

function walkSpec(spec, visit) {
  if (!spec || typeof spec !== 'object') return;
  const isSwagger2 = spec.swagger === '2.0';
  const seen = new Set();
  const host = schemaHost(spec);
  for (const [name, schema] of Object.entries(host)) {
    walkSchema(schema, name, visit, seen);
  }
  for (const [route, item] of Object.entries(spec.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    walkParameters(item.parameters, isSwagger2, route, visit, seen);
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op || typeof op !== 'object') continue;
      const label = method.toUpperCase() + ' ' + route;
      walkParameters(op.parameters, isSwagger2, label, visit, seen);
      if (op.requestBody) walkContent(op.requestBody.content, label + ' body', visit, seen);
      for (const [code, r] of Object.entries(op.responses || {})) {
        if (!r || typeof r !== 'object') continue;
        if (r.schema) walkSchema(r.schema, label + ' ' + code, visit, seen);
        walkContent(r.content, label + ' ' + code, visit, seen);
      }
    }
  }
}

function walkOperations(spec, visit) {
  if (!spec || typeof spec !== 'object') return;
  for (const [route, item] of Object.entries(spec.paths || {})) {
    if (!item || typeof item !== 'object') continue;
    for (const method of HTTP_METHODS) {
      if (item[method] && typeof item[method] === 'object') {
        visit(item[method], method.toUpperCase() + ' ' + route);
      }
    }
  }
}

module.exports = { walkSpec, walkOperations };
