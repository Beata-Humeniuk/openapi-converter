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

| Marker | Result |
|---|---|
| `[example: <value>]` | Sets `example`. Uses `x-example` for Swagger 2.0 non-body parameters. |
| `[default: <value>]` | Sets `default`. |
| `[exampleBody: {...}]` | Sets a complete object example and copies its values to matching fields. |
| `[format: <name>]` | Sets `format`, for example `uuid`, `date`, `date-time`, `email`, or `int64`. |
| `[pattern: <regex>]` | Sets `pattern` on a string field. |
| `[enum: A, B, C]` | Sets `enum` and converts each value to the field type. |
| `[title: <text>]` | Sets `title`. |
| `[minimum: <n>]`, `[maximum: <n>]` | Set numeric limits. |
| `[exclusiveMinimum: <value>]`, `[exclusiveMaximum: <value>]` | Set a number for OpenAPI 3.1+, or `true` or `false` for OpenAPI 3.0. |
| `[multipleOf: <n>]` | Sets `multipleOf`. For example, `0.01` allows two decimal places. |
| `[minLength: <n>]`, `[maxLength: <n>]` | Set string length limits. |
| `[minItems: <n>]`, `[maxItems: <n>]` | Set array size limits. |
| `[minProperties: <n>]`, `[maxProperties: <n>]` | Set object property limits. |
| `[nullable]` | Sets `nullable: true`, or `x-nullable: true` in Swagger 2.0. |
| `[deprecated]`, `[readOnly]`, `[writeOnly]`, `[uniqueItems]` | Set the matching field to `true`. |

## Operation markers

Operation markers can appear in an operation's `description` or `summary`.

| Marker | Result |
|---|---|
| `[operationId: <name>]` | Sets `operationId`. |
| `[summary: <text>]` | Sets `summary`. |
| `[tags: A, B]` | Sets `tags`. |
| `[deprecated]` | Sets `deprecated: true`. |
| `[consumes: <types>]` | Sets `consumes` in Swagger 2.0. In OpenAPI 3.x, changes request body media types. |
| `[produces: <types>]` | Sets `produces` in Swagger 2.0. In OpenAPI 3.x, changes response media types. |
| `[response: <code> "<description>" #<Schema> {...}]` | Adds a response with the given status code, an optional description, an optional body schema, and an optional JSON example. See [`response`](#response). |
| `[responseCase: <code> <name> "<summary>" {...}]` | Adds one named example case to a response. OpenAPI 3.x only. See [`responseCase` and `requestCase`](#responsecase-and-requestcase). |
| `[requestCase: <name> "<summary>" {...}]` | Adds one named example case to the request body. OpenAPI 3.x only. See [`responseCase` and `requestCase`](#responsecase-and-requestcase). |

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

- The status code is `100`–`599`, a range such as `4XX` (OpenAPI 3.x only),
  or `default`. An invalid code keeps the marker in the description.
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
than once produces the same result. **OpenAPI: Convert Version** applies markers
before converting the file.
