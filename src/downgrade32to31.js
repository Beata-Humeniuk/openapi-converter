
const clone = (x) => JSON.parse(JSON.stringify(x));

const MEDIA_KEYS_32 = ['itemSchema', 'itemEncoding', 'prefixEncoding'];
const TAG_KEYS_32 = ['summary', 'parent', 'kind'];

function walk(node, fn) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, fn);
  } else if (node && typeof node === 'object') {
    fn(node);
    for (const key of Object.keys(node)) walk(node[key], fn);
  }
}

function downgrade32to31(doc) {
  const out = clone(doc);
  const warnings = [];
  const warn = (msg) => { if (!warnings.includes(msg)) warnings.push(msg); };
  out.openapi = '3.1.2';

  if ('$self' in out) {
    delete out.$self;
    warn('`$self` does not exist in OpenAPI 3.1 — dropped');
  }

  const pathItems = [];
  for (const [p, item] of Object.entries(out.paths || {})) if (item) pathItems.push(['paths ' + p, item]);
  for (const [p, item] of Object.entries(out.webhooks || {})) if (item) pathItems.push(['webhooks ' + p, item]);
  for (const [p, item] of Object.entries((out.components || {}).pathItems || {})) if (item) pathItems.push(['components.pathItems ' + p, item]);
  for (const [where, item] of pathItems) {
    if (item.query) {
      delete item.query;
      warn(where + ': the `query` operation does not exist in OpenAPI 3.1 — dropped');
    }
    if (item.additionalOperations) {
      delete item.additionalOperations;
      warn(where + ': `additionalOperations` does not exist in OpenAPI 3.1 — dropped');
    }
  }

  for (const tag of Array.isArray(out.tags) ? out.tags : []) {
    if (!tag || typeof tag !== 'object') continue;
    for (const key of TAG_KEYS_32) {
      if (key in tag) {
        delete tag[key];
        warn('tag `' + (tag.name || '?') + '`: the `' + key + '` field does not exist in OpenAPI 3.1 — dropped');
      }
    }
  }

  walk(out, (obj) => {
    if (obj.content && typeof obj.content === 'object' && !Array.isArray(obj.content)) {
      for (const [mt, media] of Object.entries(obj.content)) {
        if (!media || typeof media !== 'object') continue;
        for (const key of MEDIA_KEYS_32) {
          if (key in media) {
            delete media[key];
            warn('content ' + mt + ': `' + key + '` does not exist in OpenAPI 3.1 — dropped');
          }
        }
      }
    }
    if (obj.flows && typeof obj.flows === 'object' && obj.flows.deviceAuthorization) {
      delete obj.flows.deviceAuthorization;
      warn('securityScheme: the `deviceAuthorization` flow does not exist in OpenAPI 3.1 — dropped');
    }
    if (obj.type === 'oauth2' && 'oauth2MetadataUrl' in obj) {
      delete obj.oauth2MetadataUrl;
      warn('securityScheme: `oauth2MetadataUrl` does not exist in OpenAPI 3.1 — dropped');
    }
  });

  return { openapi: out, warnings };
}

module.exports = { downgrade32to31 };
