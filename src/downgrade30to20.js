
const clone = (x) => JSON.parse(JSON.stringify(x));

function refTo20(ref) {
  return ref
    .replace('#/components/schemas/', '#/definitions/')
    .replace('#/components/parameters/', '#/parameters/')
    .replace('#/components/responses/', '#/responses/');
}

function resolveLocal(doc, ref) {
  const parts = ref.replace(/^#\//, '').split('/');
  let node = doc;
  for (const p of parts) {
    node = node && node[p.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return node;
}

function downgrade30to20(doc) {
  const warnings = [];
  const warn = (msg) => { if (!warnings.includes(msg)) warnings.push(msg); };

  function copyExtensions(from, to) {
    if (!from || typeof from !== 'object') return to;
    for (const [key, val] of Object.entries(from)) {
      if (key.startsWith('x-') && !(key in to)) to[key] = clone(val);
    }
    return to;
  }

  function convertSchema(schema, where) {
    if (!schema || typeof schema !== 'object') return schema;
    if (Array.isArray(schema)) return schema.map((s) => convertSchema(s, where));
    const out = {};
    // Fields with no Swagger 2.0 counterpart that our tag vocabulary already
    // covers ([writeOnly] etc.) are written into the description as a tag
    // instead of being lost for good: Apply Markers (or converting back up)
    // recovers them into a real field again.
    const pendingTags = [];
    for (const [key, val] of Object.entries(schema)) {
      switch (key) {
        case '$ref':
          out.$ref = refTo20(val);
          break;
        case 'nullable':
          if (val === true) out['x-nullable'] = true;
          break;
        case 'deprecated':
          out['x-deprecated'] = val;
          break;
        case 'writeOnly':
          if (val === true) {
            pendingTags.push('[writeOnly]');
            warn(where + ': `writeOnly` does not exist in Swagger 2.0 — kept as a [writeOnly] tag in the field description');
          }
          break;
        case 'oneOf':
        case 'anyOf':
          warn(where + ': `' + key + '` does not exist in Swagger 2.0 — the first variant was used');
          Object.assign(out, convertSchema(val[0], where));
          break;
        case 'not':
          warn(where + ': `not` does not exist in Swagger 2.0 — dropped');
          break;
        case 'allOf':
        case 'items':
          out[key] = convertSchema(val, where);
          break;
        case 'properties': {
          out.properties = {};
          for (const [name, sub] of Object.entries(val)) {
            out.properties[name] = convertSchema(sub, where + '.' + name);
          }
          break;
        }
        case 'additionalProperties':
          out[key] = typeof val === 'object' ? convertSchema(val, where) : val;
          break;
        default:
          out[key] = clone(val);
      }
    }
    if (pendingTags.length) {
      out.description = out.description ? out.description + '\n' + pendingTags.join(' ') : pendingTags.join(' ');
    }
    return out;
  }

  function flattenParamSchema(target, schema, where) {
    let s = schema;
    if (s && s.$ref) {
      const resolved = resolveLocal(doc, s.$ref);
      if (resolved) s = resolved;
      else { warn(where + ': unresolvable $ref in a parameter — assumed type: string'); s = { type: 'string' }; }
    }
    s = convertSchema(s || { type: 'string' }, where);
    const allowed = ['type', 'format', 'items', 'enum', 'default', 'maximum', 'exclusiveMaximum',
      'minimum', 'exclusiveMinimum', 'maxLength', 'minLength', 'pattern', 'maxItems', 'minItems',
      'uniqueItems', 'multipleOf', 'x-nullable'];
    for (const key of allowed) if (key in s) target[key] = s[key];
    if (!target.type) target.type = 'string';
  }

  function collectionFormatFrom(p) {
    const style = p.style || (p.in === 'query' || p.in === 'cookie' ? 'form' : 'simple');
    const explode = p.explode !== undefined ? p.explode : style === 'form';
    if (style === 'form') return explode ? 'multi' : 'csv';
    if (style === 'spaceDelimited') return 'ssv';
    if (style === 'pipeDelimited') return 'pipes';
    return 'csv';
  }

  function convertParam(p, where) {
    if (p.$ref) return { $ref: refTo20(p.$ref) };
    if (p.in === 'cookie') {
      warn(where + ': `in: cookie` parameters do not exist in Swagger 2.0 — dropped');
      return null;
    }
    const out = copyExtensions(p, { name: p.name, in: p.in });
    if (p.description) out.description = p.description;
    if (p.required) out.required = p.required;
    if (p.allowEmptyValue) out.allowEmptyValue = p.allowEmptyValue;
    if (p.deprecated) out['x-deprecated'] = true;
    if (p.content) {
      const media = Object.keys(p.content)[0];
      warn(where + ': parameter with `content` (' + media + ') — flattened to the schema of that media type');
      flattenParamSchema(out, p.content[media].schema, where);
    } else {
      flattenParamSchema(out, p.schema, where);
    }
    if (out.type === 'array') out.collectionFormat = collectionFormatFrom(p);
    return out;
  }

  function convertHeader(h, where) {
    if (h.$ref) {
      const resolved = resolveLocal(doc, h.$ref);
      if (!resolved) { warn(where + ': unresolvable header $ref — dropped'); return null; }
      h = resolved;
    }
    const out = {};
    if (h.description) out.description = h.description;
    flattenParamSchema(out, h.schema, where);
    return out;
  }

  function preferredMedia(content, where) {
    const keys = Object.keys(content || {});
    if (!keys.length) return null;
    const pick = keys.includes('application/json') ? 'application/json' : keys[0];
    if (keys.length > 1) warn(where + ': multiple media types (' + keys.join(', ') + ') — schema taken from ' + pick);
    return pick;
  }

  function convertResponse(r, where, producesSet) {
    if (r.$ref) return { $ref: refTo20(r.$ref) };
    const out = copyExtensions(r, { description: r.description || '' });
    if (r.headers) {
      out.headers = {};
      for (const [name, h] of Object.entries(r.headers)) {
        const converted = convertHeader(h, where + '.headers.' + name);
        if (converted) out.headers[name] = converted;
      }
    }
    if (r.content) {
      const media = preferredMedia(r.content, where);
      if (media) {
        for (const key of Object.keys(r.content)) producesSet.add(key);
        if (r.content[media].schema) out.schema = convertSchema(r.content[media].schema, where);
      }
    }
    if (r.links) warn(where + ': `links` do not exist in Swagger 2.0 — dropped');
    return out;
  }

  function convertRequestBody(rb, where, consumesSet) {
    if (rb.$ref) {
      const resolved = resolveLocal(doc, rb.$ref);
      if (!resolved) { warn(where + ': unresolvable requestBody $ref — dropped'); return []; }
      rb = resolved;
    }
    const media = preferredMedia(rb.content, where);
    if (!media) return [];
    for (const key of Object.keys(rb.content)) consumesSet.add(key);
    let schema = rb.content[media].schema || {};

    if (media === 'application/x-www-form-urlencoded' || media.startsWith('multipart/')) {
      if (schema.$ref) {
        const resolved = resolveLocal(doc, schema.$ref);
        if (resolved) schema = resolved;
      }
      const params = [];
      const required = schema.required || [];
      for (const [name, prop] of Object.entries(schema.properties || {})) {
        const p = { name, in: 'formData' };
        if (required.includes(name)) p.required = true;
        if (prop.format === 'binary' || prop.contentEncoding === 'binary') {
          p.type = 'file';
        } else {
          flattenParamSchema(p, prop, where + '.' + name);
        }
        if (prop.description) p.description = prop.description;
        params.push(p);
      }
      return params;
    }

    const p = { name: rb['x-name'] || 'body', in: 'body', schema: convertSchema(schema, where) };
    if (rb.required) p.required = true;
    if (rb.description) p.description = rb.description;
    return [p];
  }

  function convertSecurityScheme(name, s) {
    if (s.$ref) s = resolveLocal(doc, s.$ref) || s;
    if (s.type === 'apiKey') return { type: 'apiKey', name: s.name, in: s.in, description: s.description };
    if (s.type === 'http' && s.scheme === 'basic') return { type: 'basic', description: s.description };
    if (s.type === 'http') {
      warn('securitySchemes.' + name + ': the `http/' + s.scheme + '` scheme does not exist in Swagger 2.0 — approximated as an apiKey in the Authorization header');
      return { type: 'apiKey', name: 'Authorization', in: 'header', description: s.description };
    }
    if (s.type === 'oauth2') {
      const flowMap = { implicit: 'implicit', password: 'password', clientCredentials: 'application', authorizationCode: 'accessCode' };
      const flows = Object.keys(s.flows || {});
      if (!flows.length) { warn('securitySchemes.' + name + ': oauth2 without flows — dropped'); return null; }
      if (flows.length > 1) warn('securitySchemes.' + name + ': multiple flows (' + flows.join(', ') + ') — Swagger 2.0 holds one, took ' + flows[0]);
      const flow = s.flows[flows[0]];
      const out = { type: 'oauth2', flow: flowMap[flows[0]], scopes: flow.scopes || {}, description: s.description };
      if (flow.authorizationUrl) out.authorizationUrl = flow.authorizationUrl;
      if (flow.tokenUrl) out.tokenUrl = flow.tokenUrl;
      return out;
    }
    warn('securitySchemes.' + name + ': the `' + s.type + '` type does not exist in Swagger 2.0 — approximated as an apiKey in the Authorization header');
    return { type: 'apiKey', name: 'Authorization', in: 'header', description: s.description };
  }

  const out = copyExtensions(doc, { swagger: '2.0', info: clone(doc.info) });

  if (Array.isArray(doc.servers) && doc.servers.length) {
    if (doc.servers.length > 1) {
      warn('servers: Swagger 2.0 holds a single server — took the first one (' + doc.servers[0].url + ')');
    }
    let url = doc.servers[0].url;
    for (const [name, v] of Object.entries(doc.servers[0].variables || {})) {
      warn('servers: variable {' + name + '} substituted with its default value "' + v.default + '"');
      url = url.split('{' + name + '}').join(v.default);
    }
    try {
      const u = new URL(url);
      out.schemes = [u.protocol.replace(':', '')];
      out.host = u.host;
      if (u.pathname && u.pathname !== '/') out.basePath = u.pathname.replace(/\/$/, '');
    } catch (e) {
      if (url && url !== '/') out.basePath = url.replace(/\/$/, '');
    }
  }

  if (doc.paths) {
    out.paths = {};
    const httpMethods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
    for (const [route, pathItem] of Object.entries(doc.paths)) {
      const outPath = copyExtensions(pathItem, {});
      if (pathItem.parameters) {
        outPath.parameters = pathItem.parameters
          .map((p, i) => convertParam(p, 'paths.' + route + '.parameters[' + i + ']'))
          .filter(Boolean);
      }
      for (const method of httpMethods) {
        const op = pathItem[method];
        if (!op) continue;
        const where = method.toUpperCase() + ' ' + route;
        const outOp = copyExtensions(op, {});
        for (const key of ['tags', 'summary', 'description', 'operationId', 'deprecated', 'security', 'externalDocs']) {
          if (key in op) outOp[key] = clone(op[key]);
        }
        const params = (op.parameters || [])
          .map((p, i) => convertParam(p, where + '.parameters[' + i + ']'))
          .filter(Boolean);
        if (op.requestBody) {
          const opConsumes = new Set();
          params.push(...convertRequestBody(op.requestBody, where + '.requestBody', opConsumes));
          if (opConsumes.size) outOp.consumes = [...opConsumes];
        }
        if (params.length) outOp.parameters = params;
        outOp.responses = {};
        const opProduces = new Set();
        for (const [code, r] of Object.entries(op.responses || {})) {
          outOp.responses[code] = convertResponse(r, where + '.responses.' + code, opProduces);
        }
        if (opProduces.size) outOp.produces = [...opProduces];
        if (op.callbacks) warn(where + ': `callbacks` do not exist in Swagger 2.0 — dropped');
        outPath[method] = outOp;
      }
      out.paths[route] = outPath;
    }
  }

  const c = doc.components || {};
  if (c.schemas) {
    out.definitions = {};
    for (const [name, s] of Object.entries(c.schemas)) {
      out.definitions[name] = convertSchema(s, 'schemas.' + name);
    }
  }
  if (c.parameters) {
    out.parameters = {};
    for (const [name, p] of Object.entries(c.parameters)) {
      const converted = convertParam(p, 'components.parameters.' + name);
      if (converted) out.parameters[name] = converted;
    }
  }
  if (c.responses) {
    out.responses = {};
    for (const [name, r] of Object.entries(c.responses)) {
      out.responses[name] = convertResponse(r, 'components.responses.' + name, new Set());
    }
  }
  if (c.securitySchemes) {
    out.securityDefinitions = {};
    for (const [name, s] of Object.entries(c.securitySchemes)) {
      const converted = convertSecurityScheme(name, s);
      if (converted) {
        if (converted.description === undefined) delete converted.description;
        out.securityDefinitions[name] = converted;
      }
    }
  }
  for (const dropped of ['links', 'callbacks', 'examples']) {
    if (c[dropped] && Object.keys(c[dropped]).length) {
      warn('components.' + dropped + ': do not exist in Swagger 2.0 — dropped');
    }
  }

  for (const key of ['security', 'tags', 'externalDocs']) {
    if (key in doc) out[key] = clone(doc[key]);
  }

  return { swagger: out, warnings };
}

module.exports = { downgrade30to20 };
