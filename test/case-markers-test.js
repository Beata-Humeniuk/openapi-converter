const { applyMarkers } = require('../src/exampleFill');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const caseSpec = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: {
    operationId: 'createOrder',
    description: 'Creates an order.\n' +
      '[requestCase: [name: minimal] [summary: Case 1 - required fields] [exampleBody: {"customerId": "C-1", "items": [{"sku": "S-1"}]}]]\n' +
      '[requestCase: [name: withDiscount] [exampleBody: {"customerId": "C-1", "couponCode": "X10", "items": [{"sku": "S-1"}]}]]\n' +
      '[responseCase: [code: 200] [name: confirmed] [summary: Case A] [exampleBody: {"orderId": "ORD-1", "status": "CONFIRMED", "typo": 1}]]\n' +
      '[responseCase: [code: 200] [name: pending] [summary: Case B] [exampleBody: {"orderId": "ORD-2", "status": "AWAITING_STOCK"}]]\n' +
      '[responseCase: [code: 400] [name: missingField] [summary: Case C] [exampleBody: {"code": "BAD_REQUEST", "typo": 1}]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderRequest' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } }
  } } },
  components: { schemas: {
    OrderRequest: { type: 'object', properties: { customerId: { type: 'string' }, couponCode: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { sku: { type: 'string' } } } } } },
    Order: { type: 'object', properties: { orderId: { type: 'string' }, status: { type: 'string' } } }
  } }
};
const caseStats = applyMarkers(caseSpec);
const caseOp = caseSpec.paths['/orders'].post;
const reqEx = caseOp.requestBody.content['application/json'].examples;
const okEx = caseOp.responses['200'].content['application/json'].examples;
assert(Object.keys(reqEx).join() === 'minimal,withDiscount', 'several named request cases, in the order written');
assert(reqEx.minimal.summary === 'Case 1 - required fields', 'a request case keeps its summary');
assert(reqEx.minimal.value.customerId === 'C-1', 'a request case keeps its value');
assert(reqEx.withDiscount.summary === undefined, 'a case without a summary gets only value');
assert(Object.keys(okEx).join() === 'confirmed,pending', 'several named cases under ONE response code');
assert(okEx.pending.value.status === 'AWAITING_STOCK', 'the second case for 200 keeps its own value');
assert(caseOp.responses['400'].description === 'Bad Request', 'a case creates a missing response with the reason phrase');
assert(caseStats.unknownKeys.indexOf('POST /orders 200 [confirmed].typo') >= 0,
  'a case example is checked against the response schema, labelled with the case name');
assert(caseStats.unknownKeys.indexOf('POST /orders 200 [pending].status') < 0, 'known keys are not reported');
assert(caseOp.description === 'Creates an order.', 'case markers are removed from the description');
assert(caseStats.examplesAdded === 5, 'every case counts as an example');

const caseSnapshot = JSON.stringify(caseSpec);
applyMarkers(caseSpec);
assert(JSON.stringify(caseSpec) === caseSnapshot, 'named cases are idempotent');

const caseSwagger2 = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/o': { post: { operationId: 'c',
    description: 'Op. [responseCase: [code: 200] [name: confirmed] [summary: Case A] [exampleBody: {"a": 1}]] [response: 404 "Not found"]',
    responses: {} } } }
};
const case2Stats = applyMarkers(caseSwagger2);
const case2Op = caseSwagger2.paths['/o'].post;
assert(case2Op.responses['404'] !== undefined && case2Op.responses['200'] === undefined,
  'Swagger 2.0: [response:] still works, [responseCase: ] is not applied');
assert(/\[responseCase:/.test(case2Op.description), 'Swagger 2.0: the rejected case stays visible in the description');
assert(case2Stats.notApplied.some((n) => /OpenAPI 3\.x/.test(n.reason)), 'Swagger 2.0: the case is reported with a reason');

const caseConflict = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/o': { get: { operationId: 'g',
    description: '[response: 200 "OK" {"a": 1}] [responseCase: [code: 200] [name: case1] [summary: Case A] [exampleBody: {"a": 2}]]',
    responses: {} } } }
};
const conflictStats = applyMarkers(caseConflict);
const conflictMedia = caseConflict.paths['/o'].get.responses['200'].content['application/json'];
assert(conflictMedia.example === undefined && conflictMedia.examples.case1 !== undefined,
  'a named case replaces a single example — 3.x forbids both on one media type');
assert(conflictStats.notApplied.length === 0,
  'replacing a single example with cases is normal — it must not raise a warning');

const caseNoBody = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/o': { get: { operationId: 'g',
    description: '[requestCase: [name: x] [summary: Case] [exampleBody: {"a": 1}]] [responseCase: [code: 200] [name: y] [exampleBody: {"b": 2}]] [responseCase: [code: 200] [exampleBody: {"c": 3}]]',
    responses: {} } } }
};
const noBodyStats = applyMarkers(caseNoBody);
assert(noBodyStats.notApplied.some((n) => /no request body/.test(n.reason)),
  'a request case on an operation without a body is reported');
assert(noBodyStats.notApplied.some((n) => /needs a \[name\]/.test(n.reason)), 'a case without a name is reported');
assert(caseNoBody.paths['/o'].get.responses['200'].content['application/json'].examples.y.value.b === 2,
  'the valid case in the same description is still applied');

const mergeSpec = {
  openapi: '3.1.0', info: { title: 'T', version: '1' },
  paths: { '/orders/{id}': { get: { operationId: 'getOrder',
    description: 'Fetches an order.\n' +
      '[response: 404 "Not found" #ApiError {"code": "NOT_FOUND"}]\n' +
      '[response: 400 "Text from the marker"]\n' +
      '[response: 409 #OtherError]\n' +
      '[responseCase: [code: 500] [name: failure] [summary: Case] [exampleBody: {"code": "INTERNAL"}]]',
    responses: {
      '200': { description: 'OK from the generator',
               headers: { 'X-Request-Id': { schema: { type: 'string' } } },
               content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } },
      '400': { description: 'Old text from the generator',
               headers: { 'X-Id': { schema: { type: 'string' } } },
               content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
      '409': { description: 'Conflict from the generator',
               content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
      '500': { description: 'Error from the generator',
               content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } }
    } } } },
  components: { schemas: {
    Order: { type: 'object', properties: { orderId: { type: 'string' } } },
    ApiError: { type: 'object', properties: { code: { type: 'string' } } },
    OtherError: { type: 'object', properties: { err: { type: 'string' } } }
  } }
};
const before200 = JSON.stringify(mergeSpec.paths['/orders/{id}'].get.responses['200']);
applyMarkers(mergeSpec);
const mergeOp = mergeSpec.paths['/orders/{id}'].get;

assert(Object.keys(mergeOp.responses).join() === '200,400,404,409,500',
  'codes from the generator survive and the marker codes are added alongside');
assert(JSON.stringify(mergeOp.responses['200']) === before200,
  'a response no marker mentions is byte-identical afterwards, headers included');
assert(mergeOp.responses['400'].description === 'Text from the marker',
  'a description given by the marker replaces the generated one');
assert(mergeOp.responses['400'].headers['X-Id'] !== undefined &&
  mergeOp.responses['400'].content['application/json'].schema.$ref === '#/components/schemas/ApiError',
  'but the headers and the schema the marker did not mention stay');
assert(mergeOp.responses['409'].description === 'Conflict from the generator',
  'a schema-only marker leaves the generated description alone');
assert(mergeOp.responses['409'].content['application/json'].schema.$ref === '#/components/schemas/OtherError',
  'and swaps only the schema it names');
assert(mergeOp.responses['500'].description === 'Error from the generator' &&
  mergeOp.responses['500'].content['application/json'].examples.failure !== undefined &&
  mergeOp.responses['500'].content['application/json'].schema.$ref === '#/components/schemas/ApiError',
  'a case added to a generated response keeps its description and schema');

const modelCaseSpec = () => ({
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: { operationId: 'createOrder',
    description: 'Creates an order.\n' +
      '[requestCase: [name: standard] [summary: Standard order]]\n' +
      '[requestCase: [name: bulk] [summary: Bulk order] [exampleBody: {"customerId": "C-1", "items": [{"sku": "S-9"}]}]]\n' +
      '[responseCase: [code: 200] [name: ok] [summary: Confirmed]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderRequest' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } } } } },
  components: { schemas: {
    OrderRequest: { type: 'object', properties: {
      customerId: { type: 'string', description: 'Reference. [example: "C-1"]' },
      note:       { type: 'string', description: 'No example here.' },
      shipTo:     { $ref: '#/components/schemas/Address' },
      items:      { type: 'array', items: { type: 'object', properties: {
        sku: { type: 'string', description: '[example: "S-1"]' },
        qty: { type: 'integer', description: '[example: 1]' } } } },
      alerts:     { type: 'array', items: { type: 'string', description: '[example: ["SMS", "MAIL"]]' } }
    } },
    Address: { type: 'object', properties: { city: { type: 'string', description: '[example: "Lisbon"]' } } },
    Order: { type: 'object', properties: { orderId: { type: 'string', description: '[example: "ORD-1"]' } } }
  } }
});
const modelCase = modelCaseSpec();
const modelStats = applyMarkers(modelCase);
const modelOp = modelCase.paths['/orders'].post;
const modelReq = modelOp.requestBody.content['application/json'].examples;
assert(JSON.stringify(modelReq.standard.value) ===
  '{"customerId":"C-1","shipTo":{"city":"Lisbon"},"items":[{"sku":"S-1","qty":1}],"alerts":["SMS","MAIL"]}',
  'a case with no JSON is built from the field examples of the body schema, through $ref and into array items');
assert(modelReq.standard.value.note === undefined, 'a field with no example is left out, silently');
assert(modelStats.notApplied.length === 0, 'and nothing is reported for it');
assert(modelReq.standard.summary === 'Standard order', 'the summary still describes the generated case');
assert(Object.keys(modelReq).join() === 'standard,bulk', 'generated and hand-written cases sit side by side, in order');
assert(JSON.stringify(modelReq.bulk.value) === '{"customerId":"C-1","items":[{"sku":"S-9"}]}',
  'the hand-written case keeps exactly what was written');
assert(JSON.stringify(modelOp.responses['200'].content['application/json'].examples.ok.value) === '{"orderId":"ORD-1"}',
  '[responseCase: ] builds from the model the same way');
assert(modelCase.components.schemas.OrderRequest.properties.customerId.example === 'C-1',
  'the field markers are still applied to the schema itself');
assert(modelOp.description === 'Creates an order.', 'applied case markers leave the description');

const modelSnapshot = JSON.stringify(modelCase);
applyMarkers(modelCase);
assert(JSON.stringify(modelCase) === modelSnapshot, 'cases built from the model are idempotent');

const refCase = modelCaseSpec();
refCase.paths['/orders'].post.description = '[requestCase: [name: fromAddress] [summary: Just the address] [schema: Address]]';
applyMarkers(refCase);
assert(JSON.stringify(refCase.paths['/orders'].post.requestBody.content['application/json']
  .examples.fromAddress.value) === '{"city":"Lisbon"}',
  '#Schema builds the case from the named schema instead of the one on the media type');

const refPointer = modelCaseSpec();
refPointer.paths['/orders'].post.description = '[requestCase: [name: a] [summary: X] [schema: #/components/schemas/Address]]';
applyMarkers(refPointer);
assert(refPointer.paths['/orders'].post.requestBody.content['application/json'].examples.a.value.city === 'Lisbon',
  'a full JSON pointer names the schema too');

const bothForms = modelCaseSpec();
bothForms.paths['/orders'].post.description = '[requestCase: [name: a] [summary: X] [schema: Address] [exampleBody: {"city": "Porto"}]]';
const bothStats = applyMarkers(bothForms);
assert(bothForms.paths['/orders'].post.requestBody.content['application/json'].examples === undefined,
  'a schema and an example in one case is refused, not half-applied');
assert(bothStats.notApplied.some((n) => /both \[schema\] and \[exampleBody\]/.test(n.reason)), 'and reported with a reason');
assert(/\[requestCase:/.test(bothForms.paths['/orders'].post.description), 'the refused marker stays visible');

const missingRef = modelCaseSpec();
missingRef.paths['/orders'].post.description = '[requestCase: [name: a] [summary: X] [schema: DoesNotExist]]';
const missingStats = applyMarkers(missingRef);
assert(missingStats.notApplied.some((n) => /DoesNotExist does not exist/.test(n.reason)),
  'a schema that is not in the file is reported');

const emptyModel = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/x': { post: { operationId: 'p', description: '[requestCase: [name: standard] [summary: Std]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Bare' } } } },
    responses: {} } } },
  components: { schemas: { Bare: { type: 'object', properties: { a: { type: 'string' } } } } }
};
const emptyStats = applyMarkers(emptyModel);
assert(emptyModel.paths['/x'].post.requestBody.content['application/json'].examples === undefined,
  'a model with no examples produces no empty case');
assert(emptyStats.notApplied.some((n) => /would come out empty/.test(n.reason)), 'it is reported instead');
assert(/\[requestCase:/.test(emptyModel.paths['/x'].post.description), 'and the marker stays visible');

const modelArrays = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/x': { post: { operationId: 'p', description: '[requestCase: [name: standard] [summary: Std]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Lists' } } } },
    responses: {} } } },
  components: { schemas: { Lists: { type: 'object', properties: {
    onArray:   { type: 'array', items: { type: 'string' }, description: 'One value written on the array. [example: "SMS"]' },
    onItem:    { type: 'array', items: { type: 'string', description: '[example: "SMS"]' } },
    listOnItem: { type: 'array', items: { type: 'string', description: '[example: ["SMS", "MAIL"]]' } },
    matrix:    { type: 'array', items: { type: 'array', items: { type: 'integer' }, description: '[example: [1, 2]]' } }
  } } } }
};
applyMarkers(modelArrays);
const arraysValue = modelArrays.paths['/x'].post.requestBody.content['application/json'].examples.standard.value;
assert(JSON.stringify(arraysValue.onArray) === '["SMS"]',
  'a single value belonging to an array is wrapped in the generated case, as the schema promises a list');
assert(JSON.stringify(arraysValue.onItem) === '["SMS"]', 'a single value on the item makes a one-element list');
assert(JSON.stringify(arraysValue.listOnItem) === '["SMS","MAIL"]', 'a list on the item note fills the array itself');
assert(JSON.stringify(arraysValue.matrix) === '[[1,2]]',
  'a list belonging to an item that is itself an array stays one level down');

const sharedTwice = modelCaseSpec();
sharedTwice.components.schemas.OrderRequest.properties.billTo = { $ref: '#/components/schemas/Address' };
sharedTwice.paths['/orders'].post.description = '[requestCase: [name: standard] [summary: Standard order]]';
applyMarkers(sharedTwice);
const twiceValue = sharedTwice.paths['/orders'].post.requestBody.content['application/json'].examples.standard.value;
assert(twiceValue.shipTo.city === 'Lisbon' && twiceValue.billTo.city === 'Lisbon',
  'two fields of the same shared type both get the example — the cycle guard does not swallow the second');

const modelCase2 = {
  swagger: '2.0', info: { title: 'T', version: '1' },
  paths: { '/x': { post: { operationId: 'p', description: '[requestCase: [name: standard] [summary: Std]]',
    parameters: [{ name: 'body', in: 'body', schema: { $ref: '#/definitions/B' } }], responses: {} } } },
  definitions: { B: { type: 'object', properties: { a: { type: 'string', description: '[example: "X"]' } } } }
};
const modelCase2Stats = applyMarkers(modelCase2);
assert(modelCase2Stats.notApplied.some((n) => /OpenAPI 3\.x/.test(n.reason)),
  'Swagger 2.0: a case built from the model is refused like any other case');


const orderedCases = () => ({
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: { operationId: 'createOrder',
    description: 'Creates an order.\n' +
      '[requestCase: [name: bulk] [summary: Bulk order] [order: 3] [exampleBody: {"customerId": "C-3"}]]\n' +
      '[requestCase: [name: minimal] [summary: Only what is required] [order: 1] [exampleBody: {"customerId": "C-1"}]]\n' +
      '[requestCase: [name: withCoupon] [summary: With a coupon] [order: 2] [exampleBody: {"customerId": "C-2"}]]\n' +
      '[responseCase: [code: 200] [name: pending] [summary: Waiting] [order: 2] [exampleBody: {"orderId": "ORD-2"}]]\n' +
      '[responseCase: [code: 200] [name: confirmed] [summary: Confirmed] [order: 1] [exampleBody: {"orderId": "ORD-1"}]]\n' +
      '[responseCase: [code: 400] [name: badInput] [summary: Bad input] [order: 1] [exampleBody: {"code": "BAD_REQUEST"}]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderRequest' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } } } } },
  components: { schemas: {
    OrderRequest: { type: 'object', required: ['customerId'], properties: { customerId: { type: 'string' }, couponCode: { type: 'string' } } },
    Order: { type: 'object', properties: { orderId: { type: 'string' } } }
  } }
});
const ordered = orderedCases();
const orderedStats = applyMarkers(ordered);
const orderedOp = ordered.paths['/orders'].post;
assert(Object.keys(orderedOp.requestBody.content['application/json'].examples).join() === 'minimal,withCoupon,bulk',
  '[order:] sorts the request cases, whatever order the markers were written in');
assert(Object.keys(orderedOp.responses['200'].content['application/json'].examples).join() === 'confirmed,pending',
  'response cases are sorted within one status code');
assert(Object.keys(orderedOp.responses['400'].content['application/json'].examples).join() === 'badInput',
  'each response code is ordered on its own — 400 starts again at 1');
assert(orderedOp.requestBody.content['application/json'].examples.minimal.summary === 'Only what is required',
  '[order:] is not written into the file, only the summary is');
assert(orderedStats.notApplied.length === 0, 'ordered cases apply cleanly');
assert(orderedOp.description === 'Creates an order.', 'a marker built of nested parts leaves the description whole');

const orderedSnapshot = JSON.stringify(ordered);
applyMarkers(ordered);
assert(JSON.stringify(ordered) === orderedSnapshot, 'ordered cases are idempotent');

const mixedOrder = orderedCases();
mixedOrder.paths['/orders'].post.description =
  '[requestCase: [name: second] [order: 2] [exampleBody: {"customerId": "C-2"}]]\n' +
  '[requestCase: [name: last] [exampleBody: {"customerId": "C-1"}]]\n' +
  '[requestCase: [name: top] [order: 1] [exampleBody: {"customerId": "C-0"}]]';
applyMarkers(mixedOrder);
assert(Object.keys(mixedOrder.paths['/orders'].post.requestBody.content['application/json'].examples).join()
  === 'top,second,last', 'a case with no [order:] follows the highest order given so far');

const noOrder = orderedCases();
noOrder.paths['/orders'].post.description =
  '[requestCase: [name: a] [exampleBody: {"customerId": "C-1"}]]\n' +
  '[requestCase: [name: b] [exampleBody: {"customerId": "C-2"}]]\n' +
  '[requestCase: [name: c] [exampleBody: {"customerId": "C-3"}]]';
applyMarkers(noOrder);
assert(Object.keys(noOrder.paths['/orders'].post.requestBody.content['application/json'].examples).join() === 'a,b,c',
  'with no [order:] at all the cases keep the order they were written in');

const sameOrder = orderedCases();
sameOrder.paths['/orders'].post.description =
  '[requestCase: [name: a] [order: 1] [exampleBody: {"customerId": "C-1"}]]\n' +
  '[requestCase: [name: b] [order: 1] [exampleBody: {"customerId": "C-2"}]]';
applyMarkers(sameOrder);
assert(Object.keys(sameOrder.paths['/orders'].post.requestBody.content['application/json'].examples).join() === 'a,b',
  'two cases sharing one order keep the order they were written in');

const zeroOrder = orderedCases();
zeroOrder.paths['/orders'].post.description = '[requestCase: [name: a] [order: 0] [exampleBody: {"customerId": "C-1"}]]';
const zeroStats = applyMarkers(zeroOrder);
assert(zeroStats.notApplied.some((n) => /\[order\] of case a must be a whole number, 1 or greater/.test(n.reason)),
  '[order: 0] is refused with a reason');

const keptExamples = orderedCases();
keptExamples.paths['/orders'].post.requestBody.content['application/json'].examples =
  { fromTheFile: { value: { customerId: 'C-9' } } };
keptExamples.paths['/orders'].post.description =
  '[requestCase: [name: second] [order: 2] [exampleBody: {"customerId": "C-2"}]]\n' +
  '[requestCase: [name: first] [order: 1] [exampleBody: {"customerId": "C-1"}]]';
applyMarkers(keptExamples);
assert(Object.keys(keptExamples.paths['/orders'].post.requestBody.content['application/json'].examples).join()
  === 'fromTheFile,first,second',
  'examples already in the file stay ahead of the ones the markers order');

const requiredOnlySpec = () => ({
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: { operationId: 'createOrder',
    description: '[requestCase: [name: minimal] [summary: Required fields only] [order: 1] [required]]\n' +
      '[requestCase: [name: full] [summary: Everything the model states] [order: 2]]\n' +
      '[responseCase: [code: 200] [name: ok] [summary: Confirmed] [required]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderRequest' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Order' } } } } } } } },
  components: { schemas: {
    OrderRequest: { type: 'object', required: ['customerId', 'items'], properties: {
      customerId: { type: 'string', description: '[example: "C-1"]' },
      couponCode: { type: 'string', description: '[example: "SPRING10"]' },
      shipTo:     { $ref: '#/components/schemas/Address' },
      items:      { type: 'array', items: { type: 'object', required: ['sku'], properties: {
        sku: { type: 'string', description: '[example: "S-1"]' },
        note: { type: 'string', description: '[example: "gift"]' } } } }
    } },
    Address: { type: 'object', properties: { city: { type: 'string', description: '[example: "Lisbon"]' } } },
    Order: { type: 'object', required: ['orderId'], properties: {
      orderId: { type: 'string', description: '[example: "ORD-1"]' },
      status:  { type: 'string', description: '[example: "CONFIRMED"]' } } }
  } }
});
const requiredOnly = requiredOnlySpec();
const requiredStats = applyMarkers(requiredOnly);
const requiredOp = requiredOnly.paths['/orders'].post;
const requiredEx = requiredOp.requestBody.content['application/json'].examples;
assert(JSON.stringify(requiredEx.minimal.value) === '{"customerId":"C-1","items":[{"sku":"S-1"}]}',
  '[required] builds the case from the required fields only, at every level of the model');
assert(JSON.stringify(requiredEx.full.value) ===
  '{"customerId":"C-1","couponCode":"SPRING10","shipTo":{"city":"Lisbon"},"items":[{"sku":"S-1","note":"gift"}]}',
  'without [required] the case still carries every field that has an example');
assert(requiredEx.minimal.summary === 'Required fields only', 'the summary of a required-only case is kept');
assert(JSON.stringify(requiredOp.responses['200'].content['application/json'].examples.ok.value)
  === '{"orderId":"ORD-1"}', '[responseCase:] takes the required fields the same way');
assert(requiredStats.notApplied.length === 0, 'nothing is reported for a required-only case');

const requiredSnapshot = JSON.stringify(requiredOnly);
applyMarkers(requiredOnly);
assert(JSON.stringify(requiredOnly) === requiredSnapshot, 'required-only cases are idempotent');

const requiredWithRef = requiredOnlySpec();
requiredWithRef.components.schemas.Address.required = ['city'];
requiredWithRef.paths['/orders'].post.description =
  '[requestCase: [name: a] [summary: Address only] [schema: Address] [required] [order: 1]]';
applyMarkers(requiredWithRef);
assert(JSON.stringify(requiredWithRef.paths['/orders'].post.requestBody.content['application/json']
  .examples.a.value) === '{"city":"Lisbon"}', '[required] combines with [schema:]');

const requiredNone = requiredOnlySpec();
requiredNone.components.schemas.OrderRequest.required = [];
requiredNone.paths['/orders'].post.description = '[requestCase: [name: minimal] [summary: Minimal] [required]]';
const requiredNoneStats = applyMarkers(requiredNone);
assert(requiredNone.paths['/orders'].post.requestBody.content['application/json'].examples === undefined,
  'a schema that states no required field produces no empty case');
assert(requiredNoneStats.notApplied.some((n) => /no required field in the model carries an example/.test(n.reason)),
  'and the reason names the required fields');

const requiredAndBody = requiredOnlySpec();
requiredAndBody.paths['/orders'].post.description =
  '[requestCase: [name: a] [required] [exampleBody: {"customerId": "C-1"}]]';
const requiredAndBodyStats = applyMarkers(requiredAndBody);
assert(requiredAndBody.paths['/orders'].post.requestBody.content['application/json'].examples === undefined,
  '[required] and [exampleBody] in one case is refused, not half-applied');
assert(requiredAndBodyStats.notApplied.some((n) => /both \[required\] and \[exampleBody\]/.test(n.reason)),
  'and reported with a reason');

const anyOrder = [
  '[requestCase: [name: minimal] [summary: Required fields only] [order: 1] [required]]',
  '[requestCase: [required] [order: 1] [summary: Required fields only] [name: minimal]]',
  '[requestCase: [order: 1] [name: minimal] [required] [summary: Required fields only]]'
];
const anyOrderValues = anyOrder.map((marker) => {
  const spec = requiredOnlySpec();
  spec.paths['/orders'].post.description = marker;
  applyMarkers(spec);
  return JSON.stringify(spec.paths['/orders'].post.requestBody.content['application/json'].examples);
});
assert(anyOrderValues[0] === anyOrderValues[1] && anyOrderValues[1] === anyOrderValues[2],
  'the parts of a case may be written in any order — only the marker name comes first');
assert(/"summary":"Required fields only"/.test(anyOrderValues[0]) && /"customerId":"C-1"/.test(anyOrderValues[0]),
  'and every part still lands where it belongs');

const unquotedSummary = requiredOnlySpec();
unquotedSummary.paths['/orders'].post.description =
  '[requestCase: [name: a] [summary: Order for 2 items, 10% off — no quotes needed]]';
applyMarkers(unquotedSummary);
assert(unquotedSummary.paths['/orders'].post.requestBody.content['application/json'].examples.a.summary
  === 'Order for 2 items, 10% off — no quotes needed',
  'a summary runs to its closing bracket, so it needs no quotes and may carry punctuation');

const oldSyntax = requiredOnlySpec();
oldSyntax.paths['/orders'].post.description = '[requestCase: minimal "Required fields only" {"customerId": "C-1"}]';
const oldSyntaxStats = applyMarkers(oldSyntax);
assert(oldSyntax.paths['/orders'].post.requestBody.content['application/json'].examples === undefined,
  'the syntax of 1.2.0 is no longer applied');
assert(oldSyntaxStats.notApplied.some((n) => /needs a \[name\]/.test(n.reason)),
  'it is reported instead, and the reason shows the shape a case has now');
assert(/\[requestCase:/.test(oldSyntax.paths['/orders'].post.description), 'and the marker stays visible');

const unknownPart = requiredOnlySpec();
unknownPart.paths['/orders'].post.description = '[requestCase: [name: a] [position: 1]]';
const unknownPartStats = applyMarkers(unknownPart);
assert(unknownPartStats.notApplied.some((n) => /does not know the part \[position\]/.test(n.reason)),
  'a part the case does not know is named in the report');

const partTwice = requiredOnlySpec();
partTwice.paths['/orders'].post.description = '[requestCase: [name: a] [summary: One] [summary: Two]]';
const partTwiceStats = applyMarkers(partTwice);
assert(partTwiceStats.notApplied.some((n) => /gives \[summary\] twice/.test(n.reason)), 'one part twice is refused');

const looseWord = requiredOnlySpec();
looseWord.paths['/orders'].post.description = '[requestCase: [name: a] minimal]';
const looseWordStats = applyMarkers(looseWord);
assert(looseWordStats.notApplied.some((n) => /does not know what minimal means/.test(n.reason)),
  'text outside a nested part is refused, and the reason says how a part is written');

const codeOnRequest = requiredOnlySpec();
codeOnRequest.paths['/orders'].post.description = '[requestCase: [name: a] [code: 200]]';
const codeOnRequestStats = applyMarkers(codeOnRequest);
assert(codeOnRequestStats.notApplied.some((n) => /a request case belongs to the body/.test(n.reason)),
  'a [code:] on a request case is refused');

const noCode = requiredOnlySpec();
noCode.paths['/orders'].post.description = '[responseCase: [name: confirmed] [summary: Confirmed]]';
const noCodeStats = applyMarkers(noCode);
assert(noCodeStats.notApplied.some((n) => /case confirmed needs a \[code\]/.test(n.reason)),
  'a response case still needs its [code:]');


const casesInSummary = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: {
    summary: 'Creates an order. [operationId: "createOrder"] ' +
      '[requestCase: [name: minimal] [summary: Required fields only] [order: 1] [required]] ' +
      '[responseCase: [code: 200] [name: ok] [summary: Confirmed] [exampleBody: {"orderId": "ORD-1"}]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/R' } } } },
    responses: { '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } } } } },
  components: { schemas: { R: { type: 'object', required: ['customerId'], properties: {
    customerId: { type: 'string', description: '[example: "C-1"]' },
    couponCode: { type: 'string', description: '[example: "X10"]' } } } } }
};
const caseSummaryStats = applyMarkers(casesInSummary);
const caseSummaryOp = casesInSummary.paths['/orders'].post;
assert(JSON.stringify(caseSummaryOp.requestBody.content['application/json'].examples.minimal.value)
  === '{"customerId":"C-1"}',
  'a case written in the operation summary is read exactly as one written in the description');
assert(caseSummaryOp.responses['200'].content['application/json'].examples.ok.value.orderId === 'ORD-1',
  'and so is a response case');
assert(caseSummaryOp.summary === 'Creates an order.' && caseSummaryOp.operationId === 'createOrder',
  'the applied markers are taken out of the summary, leaving the title behind');
assert(caseSummaryStats.notApplied.length === 0, 'nothing is reported for markers that came in through the summary');

const casesAcrossBothFields = {
  openapi: '3.0.3', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: { operationId: 'createOrder',
    summary: 'Creates an order. [requestCase: [name: b] [order: 2] [exampleBody: {"x": 2}]]',
    description: 'More. [requestCase: [name: a] [order: 1] [exampleBody: {"x": 1}]] ' +
      '[requestCase: [name: c] [exampleBody: {"x": 3}]]',
    requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { x: { type: 'integer' } } } } } },
    responses: {} } } }
};
applyMarkers(casesAcrossBothFields);
const bothFieldsOp = casesAcrossBothFields.paths['/orders'].post;
assert(Object.keys(bothFieldsOp.requestBody.content['application/json'].examples).join() === 'a,b,c',
  'cases split between the summary and the description are ordered as one set, not two');
assert(bothFieldsOp.summary === 'Creates an order.' && bothFieldsOp.description === 'More.',
  'both fields are left with their own text');


const modelFromPluralExamples = {
  openapi: '3.1.2', info: { title: 'T', version: '1' },
  paths: { '/orders': { post: {
    description: 'Creates an order. [requestCase: [name: standard] [summary: Standard order]]',
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderRequest' } } } },
    responses: { '200': { description: 'OK' } } } } },
  components: { schemas: { OrderRequest: { type: 'object', properties: {
    customerId: { type: 'string', examples: ['C-1'] },
    couponCode: { type: 'string', description: 'Coupon. [example: "X10"]' }
  } } } }
};
const pluralStats = applyMarkers(modelFromPluralExamples);
const pluralCase = modelFromPluralExamples.paths['/orders'].post
  .requestBody.content['application/json'].examples.standard;
assert(JSON.stringify(pluralCase.value) === '{"customerId":"C-1","couponCode":"X10"}',
  'a case built from the model reads the 3.1 examples list the same way it reads a marker');
assert(pluralStats.notApplied.length === 0, 'and reports nothing left over');

console.log('case-markers-test OK');
