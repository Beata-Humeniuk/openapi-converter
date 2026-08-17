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
