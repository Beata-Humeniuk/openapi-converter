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
| `[example: <value>]` | `example`, or `x-example` on a non-body parameter | `example` | `example` |
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

A marker left waiting is not lost: **OpenAPI: Convert Version** applies the
markers to the converted file, so converting a Swagger 2.0 contract up to 3.x
turns the waiting `[writeOnly]` back into the real field. That is also how a
3.x contract survives a trip down to 2.0 and back.

## Operation markers

Operation markers can appear in an operation's `description` or `summary`.

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
| `[responseCase: <code> <name> …]` | **not applied** | ✓ | ✓ |
| `[requestCase: <name> …]` | **not applied** | ✓ | ✓ |

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
| `[example: "C:\raporty"]` | Keeps the path as written. |
| `[example: ["A","B"]]` on an array item | Sets the example on the array. |
| `[example: X]` on an array | `["X"]` |
| `[pattern: ...]` on a number | Not applied because `pattern` is only valid for strings. |

If a field has both `example` and `pattern`, the extension checks whether they
match. Mismatches are listed after the command finishes.

## Fields that use `$ref`

Swagger 2.0 and OpenAPI 3.0 ignore fields next to `$ref`. To keep marker values,
the extension wraps the reference in `allOf`:

```yaml
amount:
  allOf:
    - $ref: '#/definitions/Shared_Amount'
  description: Limit amount
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
Creates a payment.
[response: 201 "Payment created" #Payment {"id": "PAY-001", "status": "NEW"}]
[response: 409 "A payment with this ID already exists" #Error]
[response: 503]
```

becomes:

```yaml
responses:
  '201':
    description: Payment created
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/Payment'
        example:
          id: PAY-001
          status: NEW
  '409':
    description: A payment with this ID already exists
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
    description: Payment created
    schema:
      $ref: '#/definitions/Payment'
    examples:
      application/json:
        id: PAY-001
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
  example `POST /payments — the body schema Eror does not exist in the file`.

## `responseCase` and `requestCase`

One response code, or one request body, can carry several named examples —
one per case you want to document. Each marker adds one case:

```text
Creates an order.
[requestCase: minimal "Case 1 - required fields only" {"customerId": "C-1"}]
[requestCase: withCoupon "Case 2 - with a discount coupon" {"customerId": "C-1", "couponCode": "SPRING10"}]
[responseCase: 200 confirmed "Case A - confirmed straight away" {"orderId": "ORD-1", "status": "CONFIRMED"}]
[responseCase: 200 awaitingPayment "Case B - waiting for payment" {"orderId": "ORD-2", "status": "AWAITING_PAYMENT"}]
```

becomes:

```yaml
requestBody:
  content:
    application/json:
      examples:
        minimal:
          summary: Case 1 - required fields only
          value: { customerId: C-1 }
        withCoupon:
          summary: Case 2 - with a discount coupon
          value: { customerId: C-1, couponCode: SPRING10 }
responses:
  '200':
    content:
      application/json:
        examples:
          confirmed:
            summary: Case A - confirmed straight away
            value: { orderId: ORD-1, status: CONFIRMED }
          awaitingPayment:
            summary: Case B - waiting for payment
            value: { orderId: ORD-2, status: AWAITING_PAYMENT }
```

Swagger UI puts the cases in a dropdown, so a reader can switch between them.
It labels each entry with the case summary, falling back to the case name when
the case has no summary.

Value rules:

- **OpenAPI 3.x only.** Swagger 2.0 has one example per media type and no place
  for a name, so the marker is not applied: it stays in the description and is
  listed in the report. Convert the file to 3.x first, then apply the markers.
- The case name comes right after the status code (`responseCase`) or first
  (`requestCase`). It starts with a letter and may go on with letters, digits,
  `_` and `-`.
- The summary is optional, quoted or unquoted. The example itself is required
  and must be valid JSON.
- Cases are written in the order the markers appear. Repeating a name
  overwrites that case.
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

## `exampleBody`

`[exampleBody: {...}]` sets the complete example on its object and copies each
value to the matching field. It follows `allOf` and `$ref` references.

```text
Details [exampleBody: {"channel": "MAIL", "limit": {"amount": "1000.00"}}]
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
