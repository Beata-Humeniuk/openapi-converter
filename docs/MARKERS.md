# Marker reference

**OpenAPI: Apply Markers** turns supported markers in descriptions into OpenAPI
fields.

```text
Customer request number. [example: "RQ/2026/000123"] [pattern: "^RQ/\d{4}/\d{6}$"]
```

becomes:

```yaml
requestNumber:
  type: string
  description: Customer request number.
  pattern: ^RQ/\d{4}/\d{6}$
  example: RQ/2026/000123
```

Applied markers are removed from the description. Unsupported or invalid
markers remain unchanged. Marker names are case-insensitive.

See [examples/markers-swagger2.json](../examples/markers-swagger2.json) for a
complete example.

## Schema markers

Use these markers on schema properties and parameters.

The version columns say what the marker produces in a file of that version.
**OpenAPI: Apply Markers** reads the version from the file it runs on;
**OpenAPI: Convert Version** converts first, so the column of the version you
convert **to** applies.

| Marker | Swagger 2.0 | OpenAPI 3.0 | OpenAPI 3.1 / 3.2 |
|---|---|---|---|
| `[example: <value>]` | `example`, or `x-example` on a non-body parameter | `example` | `examples: [value]` on a schema, `example` on a parameter |
| `[default: <value>]` | `default` | `default` | `default` |
| `[exampleBody: {...}]` | ✓ | ✓ | ✓ |
| `[format: <name>]` | ✓ | ✓ | ✓ |
| `[pattern: <regex>]` | ✓ | ✓ | ✓ |
| `[enum: A, B, C]` | ✓ | ✓ | ✓ |
| `[title: <text>]` | ✓ | ✓ | ✓ |
| `[minimum: <n>]`, `[maximum: <n>]` | ✓ | ✓ | ✓ |
| `[multipleOf: <n>]` | ✓ | ✓ | ✓ |
| `[minLength: <n>]`, `[maxLength: <n>]` | ✓ | ✓ | ✓ |
| `[minItems: <n>]`, `[maxItems: <n>]` | ✓ | ✓ | ✓ |
| `[minProperties: <n>]`, `[maxProperties: <n>]` | ✓ | ✓ | ✓ |
| `[uniqueItems]`, `[readOnly]` | ✓ | ✓ | ✓ |
| `[exclusiveMinimum: <v>]`, `[exclusiveMaximum: <v>]` | `true` / `false` | `true` / `false` | a number |
| `[nullable]` | `x-nullable: true` | `nullable: true` | `null` added to `type` |
| `[deprecated]` | `x-deprecated: true` | ✓ | ✓ |
| `[writeOnly]` | **not applied** — stays in the description | ✓ | ✓ |

`[nullable]` differs because the versions differ: Swagger 2.0 has no such field
and the extension writes the usual `x-nullable` extension, OpenAPI 3.0 has the
`nullable` keyword, and OpenAPI 3.1 dropped it in favour of stating the type as
a list, so `type: string` becomes `type: [string, null]`.

`[exclusiveMinimum:]` and `[exclusiveMaximum:]` are a flag next to `minimum` /
`maximum` up to OpenAPI 3.0 and a number of their own from 3.1.

`[example:]` differs for the same reason. On a schema field, OpenAPI 3.1
deprecated the `example` keyword in favour of the JSON Schema `examples`
keyword, which takes a list, so from 3.1 on the marker is written as
`examples: [value]` — the same value, in the place the version asks for it. A
field that still carries the old `example` keyword loses it when a marker
writes the new one, so the file never states its example twice. On a
**parameter** the singular `example` field is current in every 3.x version,
and that is where the value goes.

### Where a marker value is written

One rule decides this, for every marker and every version:

1. If the version has an **official field** for the value, it goes there — even
   when the field is not named like the marker. `[nullable]` in OpenAPI 3.1
   becomes `type: [string, null]`, because that is how 3.1 states it.
2. If there is no official field but an **established `x-` extension**, the
   extension is used. Swagger 2.0 has no `nullable` or `deprecated` on a
   schema, so those become `x-nullable` and `x-deprecated`, and an example on a
   non-body parameter becomes `x-example`.
3. If there is neither, the marker **stays in the description** and is listed
   after the command finishes. Swagger 2.0 has no `writeOnly` and no settled
   extension for it, so `[writeOnly]` waits there.

Nothing outside the specification, apart from those established extensions, is
ever written into the file.

### A marker on a parameter

In Swagger 2.0 a parameter and its type are one object, so a marker in its
description has only one place to go. From OpenAPI 3.0 on the two are
separate, and each marker goes to the object that owns the field:

- `[enum:]`, `[format:]`, `[pattern:]`, `[minimum:]` and the rest of the
  validation markers are written into the parameter's `schema` — its type is
  what they describe. A parameter that carries `content` instead of `schema`
  is read the same way.
- `[example:]` and `[deprecated]` are written on the **parameter** itself,
  which is where both fields live in 3.x, and where Swagger UI reads the value
  it fills the "Try it out" field with.
- `[x-…]` extensions describe the parameter, so they stay on the parameter.

A parameter that already carries named `examples` keeps its `[example:]`
marker in the description, and the report says why: the specification allows
only one of the two fields at a time.

A marker left waiting is not lost: **OpenAPI: Convert Version** applies the
markers to the converted file, so converting a Swagger 2.0 contract up to 3.x
turns the waiting `[writeOnly]` back into the real field. That is also how a
3.x contract survives a trip down to 2.0 and back.

## Operation markers

Operation markers can appear in an operation's `description` or `summary`. Both
fields are read the same way, and an applied marker is taken out of whichever
one it stood in — so it makes no difference which of the two the contract's
generator writes them into. Cases split between the two fields are ordered as
one set, the summary being read first.

| Marker | Swagger 2.0 | OpenAPI 3.0 | OpenAPI 3.1 / 3.2 |
|---|---|---|---|
| `[operationId: <name>]` | ✓ | ✓ | ✓ |
| `[summary: <text>]` | ✓ | ✓ | ✓ |
| `[tags: A, B]` | ✓ | ✓ | ✓ |
| `[deprecated]` | ✓ | ✓ | ✓ |
| `[consumes: <types>]` | sets `consumes` | re-keys the request body media types | re-keys the request body media types |
| `[produces: <types>]` | sets `produces` | re-keys the response media types | re-keys the response media types |
| `[response: <code> …]` — exact code | `schema` + `examples` | `content` | `content` |
| `[response: 4XX …]` — code range | **not applied** | ✓ | ✓ |
| `[response: default …]` | ✓ | ✓ | ✓ |
| `[responseCase: [code: …] [name: …] …]` | **not applied** | ✓ | ✓ |
| `[requestCase: [name: …] …]` | **not applied** | ✓ | ✓ |
| `[order: <n>]` inside a case — sets the order | **not applied** | ✓ | ✓ |
| a case with no `[exampleBody:]` — value from the model | **not applied** | ✓ | ✓ |
| `[required]` inside a case — required fields only | **not applied** | ✓ | ✓ |

See [`response`](#response) and
[`responseCase` and `requestCase`](#responsecase-and-requestcase) for the full
syntax. A marker marked **not applied** stays in the description and is listed
after the command finishes: Swagger 2.0 has no code ranges, and it allows a
single example per media type with nowhere to put a case name.

Use `[x-<name>: <value>]` to add a vendor extension to a schema field or
operation.

## Value rules

Values are converted to the target field type. If a value is invalid, the
marker remains in the description.

| Marker | Result |
|---|---|
| `[example: 0012]` on a string | `"0012"` |
| `[example: 12]` on an integer | `12` |
| `[example: "12"]` on an integer | Not applied because the quoted value is text. |
| `[example: abc]` on a number | Not applied. |
| `[example: null]` | JSON `null` |
| `[example: "null"]` | The text `null` |
| `[example: ""]` | An empty string |
| `[deprecated]` | `true` |
| `[deprecated: no]` | Not applied. Flags accept only `true` or `false`. |
| `[enum: A, B]` or `[enum: ["A","B"]]` | A list converted to the field type. |
| `[example: "he said \"yes\""]` | `he said "yes"` |
| `[pattern: "^\\d+$"]` | `^\d+$` |
| `[pattern: ^\\d+$]` without quotes | Keeps both backslashes. The pattern is reported if it does not match the example. |
| `[example: "a]b, c"]` | `a]b, c` |
| `[example: "C:\reports"]` | Keeps the path as written. |
| `[example: ["A","B"]]` on an array item | Sets the example on the array. |
| `[example: X]` on an array | `["X"]` |
| `[pattern: ...]` on a number | Not applied because `pattern` is only valid for strings. |

If a field has both `example` and `pattern`, the extension checks whether they
match. Mismatches are listed after the command finishes.

## Fields that use `$ref`

Swagger 2.0 and OpenAPI 3.0 ignore fields next to `$ref`. To keep marker values,
the extension wraps the reference in `allOf`:

```yaml
quantity:
  allOf:
    - $ref: '#/definitions/Shared_Quantity'
  description: Limit quantity
  example: "5000.00"
```

The shared schema is not changed. OpenAPI 3.1 and later allow fields next to
`$ref`, so no wrapper is needed.

## `response`

`[response: ...]` adds a response to the operation. It can appear in the
operation's `description` or `summary`, once for every code you want to add.
After the status code you can give a description, a body schema (`#Name`),
and a JSON example — each part is optional:

```text
Creates a station.
[response: 201 "Station created" #Station {"id": "ST-001", "status": "NEW"}]
[response: 409 "A station with this ID already exists" #Error]
[response: 503]
```

becomes:

```yaml
responses:
  '201':
    description: Station created
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Station'
        example:
          id: ST-001
          status: NEW
  '409':
    description: A station with this ID already exists
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Error'
  '503':
    description: Service Unavailable
```

In Swagger 2.0 the same markers produce the 2.0 layout — the body schema goes
to `schema` and the example to `examples`, under the first `produces` type:

```yaml
responses:
  '201':
    description: Station created
    schema:
      $ref: '#/definitions/Station'
    examples:
      application/json:
        id: ST-001
        status: NEW
```

Value rules:

- The status code is `100`–`599`, a range such as `4XX` (OpenAPI 3.x only —
  Swagger 2.0 has no ranges, so the marker stays in the description), or
  `default`. An invalid code keeps the marker in the description.
- Without a description, the standard HTTP reason phrase is used, for example
  `404` → `Not Found`.
- The description may be unquoted (`[response: 403 No permission]`). Use
  quotes when it contains brackets, braces, or a `#`.
- The body schema is a reference to a schema that already exists in the file:
  `#Error`, or in full, `#/components/schemas/Error` or `#/definitions/Error`.
  It is written as the version-correct `$ref` — `schema` in Swagger 2.0,
  `content.<type>.schema` in OpenAPI 3.x. A name that does not exist in the
  file keeps the marker in the description.
- The example must be valid JSON — an object or a list. In OpenAPI 3.x it is
  written to `content.<type>.example`, using the media type the operation's
  responses already use, or `application/json`. In Swagger 2.0 it is written
  to `examples` under the first `produces` type.
- When the response has a schema, the example keys are checked against it —
  unknown keys are listed after the command finishes, the same way
  [`exampleBody`](#examplebody) reports them. The shared schema itself is not
  changed, so each response code keeps its own example.
- Markers add to what the file already has. Response codes produced by a
  generator stay: a code no marker mentions is left exactly as it was, headers
  and all. If the marker names a code that already exists, it updates only the
  parts it gives — description, body schema, or example — and the rest stays
  untouched. A response that is a `$ref` reference is not changed.
- A marker that cannot be applied — an invalid code, broken JSON, an unknown
  schema name, a code range in Swagger 2.0 — stays in the description and is
  listed after the command finishes, with the operation and the reason, for
  example `POST /stations — the body schema Eror does not exist in the file`.

## `responseCase` and `requestCase`

One response code, or one request body, can carry several named examples —
one per case you want to document. Each marker adds one case, and every part of
it is written the same way the markers themselves are, as `[part: value]`:

```text
Creates an order.
[requestCase: [name: minimal] [summary: Required fields only] [exampleBody: {"customerId": "C-1"}]]
[requestCase: [name: withCoupon] [summary: With a discount coupon] [exampleBody: {"customerId": "C-1", "couponCode": "SPRING10"}]]
[responseCase: [code: 200] [name: confirmed] [summary: Confirmed straight away] [exampleBody: {"orderId": "ORD-1", "status": "CONFIRMED"}]]
[responseCase: [code: 200] [name: awaitingStock] [summary: Waiting for stock] [exampleBody: {"orderId": "ORD-2", "status": "AWAITING_STOCK"}]]
```

becomes:

```yaml
requestBody:
  content:
    application/json:
      examples:
        minimal:
          summary: Required fields only
          value: { customerId: C-1 }
        withCoupon:
          summary: With a discount coupon
          value: { customerId: C-1, couponCode: SPRING10 }
responses:
  '200':
    content:
      application/json:
        examples:
          confirmed:
            summary: Confirmed straight away
            value: { orderId: ORD-1, status: CONFIRMED }
          awaitingStock:
            summary: Waiting for stock
            value: { orderId: ORD-2, status: AWAITING_STOCK }
```

Swagger UI puts the cases in a dropdown, so a reader can switch between them.
It labels each entry with the case summary, falling back to the case name when
the case has no summary.

### The parts of a case

| Part | Means |
|---|---|
| `[code: 200]` | the status code the case belongs to — `[responseCase:]` only, and required there |
| `[name: confirmed]` | the key the case gets in `examples:` — required |
| `[summary: Confirmed straight away]` | the line Swagger UI shows in its dropdown |
| `[schema: Address]` | build the value from this model schema instead of the body one |
| `[order: 2]` | where the case lands among the others — see [ordering the cases](#ordering-the-cases) |
| `[required]` | build the value from the required fields alone — see [required fields only](#required-fields-only) |
| `[exampleBody: {…}]` | the value, written by hand |

Only the marker name comes first. After it the parts may stand in any order,
because each one says for itself what it is, so all three of these are read the
same way:

```text
[responseCase: [code: 200] [name: confirmed] [summary: Confirmed] [order: 1]]
[responseCase: [order: 1] [summary: Confirmed] [code: 200] [name: confirmed]]
[responseCase: [name: confirmed] [order: 1] [code: 200] [summary: Confirmed]]
```

The first reads best and the documentation writes them that way throughout, but
nothing depends on it — there is no order to memorise, and adding a part to a
marker later cannot put anything in the wrong place.

Rules for the parts:

- Nothing is quoted. A value runs to its closing bracket, so
  `[summary: Order for 2 items, 10% off]` needs no quotes and keeps its commas,
  percent signs and dashes. This matters where the contract is generated from a
  modelling tool, because the whole description ends up inside one string in
  the file, and quotes there come out escaped and hard to read.
- Every part may be given once. A part written twice is refused and reported,
  rather than one of the two quietly winning.
- A part the marker does not know — a misspelled `[ordre: 2]` — is named in the
  report instead of being ignored.
- Text that is not inside `[…]` is refused the same way. This is what the
  syntax used up to 1.2.0 —
  `[requestCase: minimal "Required fields only" {…}]` — now runs into: it stays
  in the description and is reported, with the shape a case has today.
- `[schema:]` takes `Address`, `#Address` or `#/components/schemas/Address`.

Value rules:

- **OpenAPI 3.x only.** Swagger 2.0 has one example per media type and no place
  for a name, so the marker is not applied: it stays in the description and is
  listed in the report. Convert the file to 3.x first, then apply the markers.
- The value is either the JSON in `[exampleBody:]`, or — when the case has no
  `[exampleBody:]` — built from the model. See
  [cases built from the model](#cases-built-from-the-model) below.
- Without `[order:]`, cases come out in the order the markers appear. Repeating
  a name overwrites that case.
- A single example set by `[response:]` on the same media type is replaced by
  the named cases, because OpenAPI 3.x forbids `example` and `examples` side by
  side.
- `[responseCase:]` for a code that does not exist yet creates the response,
  using the standard HTTP reason phrase as its description.
- Case values are checked against the schema the same way as in
  [`response`](#response); unknown keys are reported with the case name, for
  example `POST /orders 200 [confirmed].typo`.
- `[example:]` markers on schema fields keep working alongside cases: they sit
  on the schema, cases sit on the media type, so nothing collides. Where a
  response has cases, the reader sees the cases; where it has none, the example
  is still built from the field values. A case carries the whole body, so a
  field left out of a case is absent from that case — field examples are not
  merged in.

### Ordering the cases

`[order: <n>]` sets where a case lands among the others, whatever order the
markers were written in. Swagger UI lists the cases in that order in its
dropdown, so the reader meets them the way you meant them to be read — and a
case added later can be slotted into the middle without moving any text around.

```text
Creates an order.
[requestCase: [name: withCoupon] [summary: With a discount coupon] [order: 2]]
[requestCase: [name: minimal] [summary: Required fields only] [order: 1] [required]]
[responseCase: [code: 200] [name: awaitingStock] [summary: Waiting for stock] [order: 2]]
[responseCase: [code: 200] [name: confirmed] [summary: Confirmed straight away] [order: 1]]
```

puts `minimal` before `withCoupon` in the request body, and `confirmed` before
`awaitingStock` under `200`.

Ordering rules:

- The order starts at 1. `[order: 0]`, or anything that is not a whole number,
  is refused and the marker is reported.
- The request body is ordered on its own, and so is every response code. Both
  `[responseCase: [code: 200] … [order: 1]]` and
  `[responseCase: [code: 400] … [order: 1]]` are the first case of their own
  code, and neither collides with `[requestCase: … [order: 1]]`.
- A case with no `[order:]` follows the highest order given so far, so leaving
  it out entirely keeps the order the markers were written in. Mixing works the
  same way: after `[order: 5]`, the next case without one is sixth.
- Two cases sharing one order keep the order they were written in.
- The numbers are not slots to be filled: 1, 5, 20 simply come out in that
  order.
- `[order:]` stays in the description marker and is never written into the
  contract — the file gets the case name, its summary and its value, in the
  order asked for.
- Examples already sitting on the media type in the file, which no marker
  names, stay in front of the cases the markers order.

### Cases built from the model

A case with no `[exampleBody:]` takes its value from the model instead of from
an example written by hand. This is what a large request body wants: the
standard case is composed from the `[example:]` values already sitting on the
fields, so a field added later shows up on the next run of the command without
anyone editing an example.

```text
Creates an order.
[requestCase: [name: standard] [summary: Standard order]]
[requestCase: [name: bulk] [summary: Bulk order with a coupon] [exampleBody: {"customerId": "C-1", "couponCode": "SPRING10"}]]
[responseCase: [code: 200] [name: confirmed] [summary: Confirmed straight away]]
```

The generated value follows `$ref` and `allOf`, descends into nested objects,
and puts one composed row inside each array. `[schema: Name]` builds from the
named schema instead of the one on the media type. A case cannot give both
`[schema:]` and `[exampleBody:]`; write one or the other.

Nothing is invented: a field with no example of its own is simply left out of
the generated case, without a word in the report. If no field in the schema
carries an example, there is nothing to build and the marker is reported and
left in the description instead of producing an empty case.

### Required fields only

`[required]` builds the case from the model the same way, but only from the
fields the schema states as `required`. This is the smallest body the contract
accepts — the case a reader copies to see what a call needs at minimum, next to
a full one that shows everything it can carry.

```text
Creates an order.
[requestCase: [name: minimal] [summary: Required fields only] [order: 1] [required]]
[requestCase: [name: full] [summary: Everything an order can carry] [order: 2]]
[responseCase: [code: 200] [name: confirmed] [summary: Confirmed] [required]]
```

- `[required]` replaces `[exampleBody:]`, it does not accompany one. Giving
  both is refused and reported: a case has either an example written by hand or
  a rule for building one.
- It reaches every level: a nested object keeps its own required fields, and a
  row inside an array keeps the required fields of the item schema. `[required]`
  and `[schema:]` combine —
  `[requestCase: [name: a] [schema: Address] [required]]` takes the required
  fields of the named schema.
- The values still come from the `[example:]` markers on the fields; a required
  field with no example is left out just as it is in a full case. When no
  required field carries an example — or the schema states no required field at
  all — there is nothing to build, and the marker is reported and stays in the
  description.
- `[required]` takes no value. `[required: yes]` is refused.

## `exampleBody`

`[exampleBody: {...}]` sets the complete example on its object and copies each
value to the matching field. It follows `allOf` and `$ref` references.

```text
Details [exampleBody: {"channel": "MAIL", "limit": {"reading": "1000.00"}}]
```

Unknown keys are skipped and listed after the command finishes.

## Markers that are not applied

Structural fields such as `type`, `required`, `properties`, `$ref`, and
`security` cannot be set with markers. Other markers, such as `[TODO: ...]` or
`[0..1]`, also remain in the description.

The command does not create values for fields without markers. Running it more
than once produces the same result.

## Markers and the target version

**OpenAPI: Convert Version** converts the file first and applies the markers to
the result, so the version you convert **to** decides what each marker can do:

| You have | You convert to | What happens |
|---|---|---|
| Swagger 2.0 with markers | OpenAPI 3.x | Everything the newer version supports is applied in one step — named cases and code ranges included. No second command to run. |
| Swagger 2.0, markers already applied once | OpenAPI 3.x | The markers that 2.0 could not use are still in the descriptions; the conversion applies them. Nothing is left over. |
| any version | a version without support | The markers that version cannot use stay in the descriptions and are listed after the command finishes. |
| OpenAPI 3.x with markers | Swagger 2.0 | What 2.0 supports is applied in 2.0 form — `x-nullable`, `x-example`, `schema` and `examples` — and the rest stays in the descriptions. |

**OpenAPI: Apply Markers** changes the file in place and never converts it, so
there the file's own version decides.
