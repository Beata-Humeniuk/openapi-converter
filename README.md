# OpenAPI Tools

VS Code extension that brings an **OpenAPI / Swagger contract into the shape
you need** — no GUI, no network, no AI.

Two jobs, one scope: **converting between specification versions** and
**applying `[marker]` values written in descriptions** into the real OpenAPI
fields they name. It invents nothing — only what is in the model lands in
the file.

**Privacy: no telemetry, no network requests, no storage.** Everything runs
locally; a contract never leaves your computer (details in
[Privacy](#privacy)).

## OpenAPI / Swagger — supported directions

| input (JSON or YAML) | → Swagger 2.0 | → OpenAPI 3.0.x | → OpenAPI 3.1.x | → OpenAPI 3.2.x |
|---|---|---|---|---|
| Swagger 2.0 | ✅ (format change only) | ✅ | ✅ | ✅ |
| OpenAPI 3.0.x | ⚠️ lossy | ✅ (format change only) | ✅ | ✅ |
| OpenAPI 3.1.x | ⚠️ lossy | ✅ | ✅ (format change only) | ✅ |
| OpenAPI 3.2.x | ⚠️ lossy | ⚠️ lossy | ⚠️ lossy | ✅ (format change only) |

"Format change only" = same version, but you can convert JSON ↔ YAML.
⚠️ Downgrading to Swagger 2.0 is inherently lossy (2.0 has no notion of
multiple servers, `oneOf`/`anyOf`, cookie parameters, `bearer`/OpenID, among
others), and downgrading from 3.2 drops 3.2-only constructs (`$self`, the
`query` method, `additionalOperations`, streaming media types, tag
hierarchies) — every approximated or dropped element lands on a warning list
that the extension shows after the conversion. When the dropped element is
something the `[marker]` vocabulary below already covers (currently:
`writeOnly` on a 3.0 → 2.0 downgrade, since Swagger 2.0 has no such
keyword), it is not just warned about — it is written into the field's
`description` as that same bracketed marker, so nothing is truly lost:
running **Apply Markers** (or converting back up) restores it into a real
field again. Structural constructs with no marker equivalent (`oneOf`, cookie
parameters, security scheme shapes…) still only get a warning — there is
no flat `[marker: value]` that could represent them.

### Version numbers

The version picker lists **every published release** with its full
three-part number: `2.0`, `3.0.0`–`3.0.4`, `3.1.0`–`3.1.2` and `3.2.0`
(the complete list from the official
[OAI/OpenAPI-Specification](https://github.com/OAI/OpenAPI-Specification)
repository). Patch releases within a line (3.0.x, 3.1.x…) are editorial
only — they fix the specification's wording, not the language — so:

- converting **within a line** (e.g. 3.0.1 → 3.0.4) only changes the
  `openapi` version number,
- picking a line lands on the newest patch of that line (marked in the
  picker),
- older patches stay available for tools that pattern-match the version
  string literally.

> **Note on third-party validators:** some tools support only OpenAPI 3.0
> and mark a perfectly valid 3.1/3.2 file as an error. For example the
> *Swagger Viewer* extension validates YAML against a schema whose version
> pattern is `^3\.0\.\d(-.+)?$`, so `openapi: 3.1.0` gets a red squiggle
> ("String does not match the pattern…") even though the file is correct.
> That message comes from the other extension, not from this converter —
> if your toolchain needs 3.0, convert to `3.0.4` instead.

Conversion engines (open source, bundled into the package):
[swagger2openapi](https://github.com/Mermade/oas-kit) (2.0 → 3.0),
[@apiture/openapi-down-convert](https://github.com/apiture/openapi-down-convert)
(3.1 → 3.0) plus built-in modules: a lossless 3.0 → 3.1 upgrade following the
official OpenAPI Initiative migration guide, a best-effort 3.2 → 3.1
downgrade with a warning report, and a best-effort 3.0 → 2.0 downgrade with
a warning report. 3.1 → 3.2 is a pure version stamp (3.2 is a superset of 3.1).

## Installation

Install **OpenAPI Tools** from the Visual Studio Code Marketplace (publisher
`beatahumeniuk`), or download the `.vsix` from the
[releases page](https://github.com/Beata-Humeniuk/openapi-tools/releases) and
install it with **Extensions: Install from VSIX…**.

## Usage

1. Open a spec file (e.g. `swagger.json`, `openapi.yaml`).
2. Run the **"OpenAPI: Convert Version"** command — from the command palette
   (`Ctrl+Shift+P` / `Cmd+Shift+P`) or from the editor / file explorer
   context menu.
3. The extension detects the input version and asks **which version**
   to convert to — the list shows every published release
   (Swagger 2.0, OpenAPI 3.0.0–3.0.4, 3.1.0–3.1.2, 3.2.0), grouped by line
   with the newest patch of each line marked.
4. Choose the output format: **YAML** or **JSON**.
5. The result opens in a new tab; the **"Save As…"** button opens a save
   dialog pre-filled with the **source file name** (no synthetic postfixes) —
   rename freely, and overwriting an existing file asks for confirmation.

Output formatting rules:
- sections in canonical order (`swagger`/`openapi` → `info` → servers →
  `paths` → definitions), 2-space indentation — a readable file out of the box;
- in Swagger 2.0 missing `consumes`/`produces` are filled with a default of
  `application/json` **at the operation level** (consumes only where the
  operation accepts a body/form, produces where a response has a schema);
  values already set in the file — globally or per operation — stay untouched.

A JSON/YAML file that is **not** a Swagger/OpenAPI spec can also be run
through the command — the extension then converts only the format
(JSON ↔ YAML) without touching the content.

## Applying markers — "OpenAPI: Apply Markers"

Contracts generated by external tools (e.g. the Enterprise Architect
plugin many teams use) arrive **missing whatever the generator cannot
express** — `example` values, but equally `format`, `pattern`, `enum`,
`consumes`/`produces`, `operationId`, `readOnly`… — and the generator
cannot be changed. This command fills all of it in, with **no side files
and no manual editing that a regeneration would wipe out**: everything it
writes is derived from the contract itself, so the EA model stays the
single source of truth and every person who runs the command on the same
generated file gets a **byte-identical result**.

It does one job: every **`[marker]` in a description** is moved into the
OpenAPI field it names. Nothing else is added — a field without a marker
comes out exactly as the model produced it.

Run it on a `swagger.json` / `openapi.yaml` (palette, or right-click in the
editor / file explorer).

### How a marker works

One universal rule: **a bracketed element in a `description` whose key is
an OpenAPI field valid in that place is treated as that field, not as
prose.** The value lands in the field and the marker disappears from the
description. Anything else (`[TODO: …]`, `[0..1]`) stays in the
description untouched.

On an **operation**, markers are read from `summary` as well as
`description` — in EA those are two separate note fields and
`[consumes:]`/`[produces:]` often end up in the shorter one. Both are
scanned, the marker disappears from whichever field carried it, and a
`summary` left with nothing but markers is removed rather than kept empty.

```
Customer request number. [example: "RQ/2026/000123"] [pattern: "^RQ/\d{4}/\d{6}$"]
```

becomes

```yaml
requestNumber:
  type: string
  description: Customer request number.
  pattern: ^RQ/\d{4}/\d{6}$
  example: RQ/2026/000123
```

A file exercising every marker and every rule below —
[`examples/markers-swagger2.json`](examples/markers-swagger2.json) — is in the
repository; run the command on it to see each case resolved.

This is the EA workflow: write the markers in the **Notes in the EA
model** — the generator already exports notes to `description` — so the
values live in the model, survive every regeneration and need no plugin
changes. It works the same on a field that is a bare `$ref` to a shared
type (common for generic wrapper attributes): the marker on that
particular usage wins, without touching the shared type itself.

### Field markers

Valid on schema properties and on parameters.

| Marker | OpenAPI field | Meaning |
|---|---|---|
| `[example: <value>]` | `example` | Sample value shown in Swagger UI and in the generated specification. |
| `[default: <value>]` | `default` | Value applied when the caller omits the field. |
| `[format: <name>]` | `format` | Semantic sub-type: `uuid`, `date`, `date-time`, `email`, `uri`, `ipv4`, `int64`, `double`… |
| `[pattern: <regex>]` | `pattern` | Regular expression the value must match. String fields only. |
| `[enum: A, B, C]` | `enum` | Closed list of allowed values (comma-separated, or a JSON array). Values are coerced to the field's type. |
| `[title: <text>]` | `title` | Short display name of the field or schema. |
| `[minimum: <n>]` / `[maximum: <n>]` | `minimum` / `maximum` | Inclusive numeric bounds. |
| `[exclusiveMinimum: <n>]` / `[exclusiveMaximum: <n>]` | `exclusiveMinimum` / `exclusiveMaximum` | Exclusive bounds — a number (3.1 style) or `true`/`false` (3.0 style, modifying `minimum`/`maximum`). |
| `[multipleOf: <n>]` | `multipleOf` | Value must be a multiple of *n*. `0.01` = at most two decimal places (the money-as-BigDecimal case). |
| `[minLength: <n>]` / `[maxLength: <n>]` | `minLength` / `maxLength` | String length bounds. |
| `[minItems: <n>]` / `[maxItems: <n>]` | `minItems` / `maxItems` | Array size bounds. |
| `[minProperties: <n>]` / `[maxProperties: <n>]` | `minProperties` / `maxProperties` | Bounds on the number of object properties. |
| `[nullable]` | `nullable` (`x-nullable` in Swagger 2.0) | The field may carry `null`. |
| `[deprecated]` | `deprecated` | The field is being withdrawn. |
| `[readOnly]` | `readOnly` | Returned in responses, never accepted in requests (e.g. a server-assigned id). |
| `[writeOnly]` | `writeOnly` | Accepted in requests, never returned (e.g. a password). |
| `[uniqueItems]` | `uniqueItems` | Array items must not repeat. |

On a **Swagger 2.0 non-body parameter** `[example:]` writes `x-example`,
because 2.0 has no `example` on parameters — that is the convention every
2.0 tool understands.

### Operation markers

Valid on an operation (its own Notes in EA).

| Marker | OpenAPI field | Meaning |
|---|---|---|
| `[operationId: <name>]` | `operationId` | Unique operation id — drives generated client method names and the file names of exports. |
| `[summary: <text>]` | `summary` | One-line summary of the operation. |
| `[tags: A, B]` | `tags` | Groups the operation — Swagger UI sections use it. |
| `[deprecated]` | `deprecated` | The operation is being withdrawn. |
| `[consumes: <types>]` | 2.0: `consumes` · 3.x: media types of `requestBody.content` | Media types the operation accepts. |
| `[produces: <types>]` | 2.0: `produces` · 3.x: media types of the responses' `content` | Media types the operation returns. |

`consumes`/`produces` do not exist as fields in OpenAPI 3.x, so there the
marker **re-keys** the media types of `content` (keeping the schemas
untouched) — that is where 3.x holds this information.

### Vendor extensions

**`[x-<anything>: <value>]`** passes through 1:1 as a vendor extension —
anywhere, on fields and operations alike:

```
[x-team: PAYMENTS]  →  x-team: PAYMENTS
```

The value is parsed as JSON when it looks like JSON, otherwise taken as
text. This is the escape hatch for anything the vocabulary above does not
cover — no extension change needed.

### Value syntax

- **Spelling is exact**, letter case of the keyword is not: `[FORMAT: uuid]`
  works, `[frmat: uuid]` does not — a mistyped marker simply stays visible
  in the description, so you can see that it was not consumed.
- **Values are coerced to the field's type**: `[example: 0012]` on a string
  stays `"0012"`, `[enum: 1, 2, 3]` on an integer becomes numbers. Values are
  written the way the contract writes them — a decimal point, `true`/`false`
  — and a value in any other notation does not fit, so its marker stays
  visible in the description.
- **Text values go in quotes, the way JSON writes them.** Everything that is
  text: plain strings, dates, timestamps, identifiers, enum values, media
  types, `operationId`, `summary`, `title`, `pattern`.

  ```
  [example: "RQST"]   [example: "2026-03-01"]   [format: "date"]
  [example: "3f2504e0-4f89-41d3-9a0c-0305e82c3301"]
  [enum: "ACTIVE", "SUSPENDED", "CLOSED"]   [default: "ACTIVE"]
  [pattern: "^AG/\d{4}/\d{6}$"]   [produces: "application/xml"]
  ```

  Numbers, flags and booleans stay bare: `[minimum: 0.5]`, `[maxItems: 5]`,
  `[deprecated]`, `[default: false]`, `[example: null]`.

  Quotes are not required — an unquoted value still works — but they earn
  their keep: they say "this is text", they protect `]`, `[` and `,` inside
  the value (`[example: "a]b, c"]`), and they keep spaces at the edges.

  **Inside quotes two escapes are recognised, and only two:** `\"` is a quote
  in the text and `\\` is a single backslash — so
  `[example: "he said \"yes\""]` yields `he said "yes"`, and
  `[pattern: "^\\d+$"]` yields `^\d+$`, the digits pattern. Everything else
  stays exactly as typed: `[example: "C:\reports"]` keeps the path (full JSON
  rules would silently turn `\r` into a carriage return), and a stray unescaped
  quote does not break the marker — `[example: "5" inch"]` yields `5" inch`.
  `[example: ""]` is the empty string. **Without quotes the text is literal**,
  which is why `[pattern: ^\\d+$]` unquoted means backslash-then-d and matches
  nothing — the run reports it as an example not matching its pattern. On a
  field the contract declares as a number or a boolean a quoted value **does
  not fit**, so the marker stays visible in the description instead of
  putting text where a number was promised — exactly what you want to see
  when the note and the model disagree. `[example: "null"]` is text,
  `[example: null]` is JSON `null`; the convention makes the difference
  visible rather than something to remember.
- **A field's own type decides what may be written on it.** `pattern`,
  `minLength`, `maxLength` are string-only; `minimum`, `maximum`,
  `multipleOf`, `exclusive*` number-only; `minItems`, `maxItems`,
  `uniqueItems` array-only; `minProperties`, `maxProperties` object-only.
  A marker landing on the wrong type — `[pattern:]` on a `number`, the
  classic — is **not** written: in JSON Schema a pattern applies to strings,
  so it would sit in the file doing nothing while looking like a live
  constraint. It stays in the description instead. A `pattern` that is not a
  valid regular expression is refused the same way.
- **`example` is checked against `pattern`.** When a field ends up with both
  and the example does not match, the field is listed at the end of the run.
  The usual cause is doubled backslashes copied from a JSON file into an EA
  note: `\\d` as a regex means "a backslash, then the letter d", so it
  matches nothing. In a note write the expression the way you would write
  the regex itself — `[pattern: ^\d+\.\d{2}$]`.
- **Brackets are balanced**, so a value containing `[` `]` is read whole:
  `[example: {"a": [1, 2]}]` on an object or array field becomes real JSON
  (on a `string` field the same text stays text — the field's type decides).
  An unclosed marker is ignored.
- **An example lands where its shape fits**, not where the note happens to
  sit. A list — `[example: ["RQST","MAIL"]]` — becomes the `example` of the
  **array**, even when EA attached the note to the element type (which is
  what it does for an attribute with multiplicity `0..*`); a single value
  written on an array becomes a one-element list, because an array's
  `example` has to be an array. Only `example`/`default` move like this —
  `format`, `pattern`, `minLength`… describe the element and stay on it.
  Write the list as JSON: `["A","B"]`, double quotes, no `['A','B']` and no
  bare `A, B`.
- **`null`** means JSON `null` on any field type, arrays included
  (`example: null`, never `[null]`). `[example: []]` sets an explicit empty
  array. For the literal four-letter text, quote it: `[example: "null"]`.
- **Flags** need no value: `[deprecated]` = `true`; write `[deprecated: false]`
  to set it to `false` explicitly. A flag takes `true`/`false` and nothing
  else — a mistyped value leaves the marker in the description instead of
  quietly switching the flag on.
- **Booleans are `true`/`false`**, letter case aside. A boolean field is one
  of two values in the file that comes out, and no word in any language is
  accepted in their place — `[example: yes]` on a `boolean` stays in the
  description, visible.
- **Lists** accept both forms: `[tags: "Payments", "Archive"]` and
  `[tags: ["Payments","Archive"]]`.
- **A value that does not fit the field** (e.g. `[minLength: abc]`) is not
  written at all — the marker stays visible in the description instead of
  corrupting the contract.
- **An applied marker is removed** from the description, which is what makes
  a second run a no-op.

### A field whose type comes from a shared model

Types that live in a shared model — a company-wide dictionary of common
types — cannot be annotated: the note has to go one level up, on the
**field** that uses the type. That field is usually a bare `$ref`, and there
is a trap in it: in Swagger 2.0 and OpenAPI 3.0 **everything next to a
`$ref` is ignored**, so an `example` written beside it looks applied and is
shown by nothing.

So a field that receives a value from a marker is wrapped in a
single-element `allOf`:

```yaml
amount:
  allOf:
    - $ref: '#/definitions/Shared_Amount'   # the reference stays a reference
  description: Limit amount
  example: "5000.00"
```

The shared type itself is never touched — that is the whole point. Fields
without markers keep their bare `$ref`. In OpenAPI 3.1 siblings of `$ref`
are legal, so nothing is restructured there. The run says how many fields
were wrapped, because this is the one place where the command changes the
shape of the file rather than just filling fields in.

### `[exampleBody: {...}]` — one sample, spread across the fields

`[example: {...}]` keeps the value whole: one example on that field.
`[exampleBody: {...}]` writes it in **both** places — on every field the
sample names, and whole on the field itself:

```
Details [exampleBody: {"channel": "MAIL", "limit": {"amount": "1000.00"}}]
```

```yaml
details:
  allOf: [ { $ref: '#/definitions/Shared_Details' } ]
  example:                       # ← payload shows exactly this
    channel: MAIL
    limit: { amount: "1000.00" }

Shared_Details:
  properties:
    channel:
      allOf: [ { $ref: '#/definitions/Shared_Channel' } ]
      example: MAIL              # ← and each field carries its own
    limit:
      properties:
        amount:
          example: "1000.00"
```

The whole-object copy is what makes **a field you did not name stay out of
the shown payload** — without it a reader composes the missing properties
from the model and shows them anyway. Leaving a field out is a decision, so
it is honoured.

The shape of the sample does not have to match the shape of the field: an
object written for a list describes one row, a one-row list written for an
object is that object. It reaches through `allOf` compositions and through
`$ref` to a shared type.

A key the model does not have is **not** written — not to the field, not to
the whole-object copy — and is listed at the end of the run, which catches
typos. When the marker cannot be applied at all (the field is a scalar, the
value is not JSON, no key matches), it stays visible in the description and
the run says which field and why.

### Which example wins

Two levels can carry an `example` for the same field: the **field** and the
**type** it points at. The field's own example wins; the type's example is
the fill-in for every field that does not have one of its own.

```yaml
amount:                                 # marker on the field → "5000.00"
  allOf: [ { $ref: '#/definitions/Shared_Amount' } ]
  example: "5000.00"
otherAmount:                            # no marker → falls through to "0.00"
  $ref: '#/definitions/Shared_Amount'
Shared_Amount:
  type: string
  example: "0.00"
```

Nothing needs configuring for this: a marker on the field is enough, and the
shared type keeps serving every other usage. It is also what the `allOf`
wrapper above is for — without it the field's own example would sit next to
a `$ref`, where tools ignore it, and the field would silently show the
type's value instead.

### Deliberately not marker-controlled

Structural fields — `type`, `required`, multiplicities, `properties`,
`$ref`, `security` — belong to the EA model itself. A second source of
truth in a note would only invite drift between the model and the
contract, so those are never read from markers.

### When a field has no example marker

**Nothing is written.** The field is left exactly as the model produced it,
and what a reader shows for it is the reader's business: Swagger UI already
derives a display value from `enum`, `default`, `format` or its own
placeholder. An `example` invented here would look like a value from the
model without being one — and would then travel into documentation, tests
and mock servers as if someone had decided it.

So the command only ever writes what the note says, or leaves what the file
already had. If a field matters and comes out empty, that is the signal to
put a marker in its EA note.

Properties of the run:

- **deterministic** — no randomness; same input file, same output, on
  every machine,
- **idempotent** — an applied marker is removed from the description, so
  running the command twice changes nothing,
- **structure-preserving** — the result lands in the editor buffer with the
  original key order and format (JSON stays JSON, YAML stays YAML), so the
  diff shows only the added fields; you save with `Ctrl+S`,
- examples are written on **scalar fields** (including array items and
  parameters — OpenAPI 3 in `schema`, Swagger 2.0 non-body parameters as
  `x-example`), so tools like Swagger UI compose object examples from them,
- the **"OpenAPI: Convert Version" command lifts the markers too** —
  converting an EA-generated file to another Swagger/OpenAPI version moves
  all bracketed field markers into real fields **before** the conversion
  runs, so `consumes`/`produces` set from markers in a 2.0 file translate
  correctly into 3.x `content` media types and nothing is lost along the way.

Recommended flow with an EA-generated contract: put field-specific values
in EA notes as bracketed markers (`[example: …]`, `[format: uuid]`,
`[produces: application/xml]`…) → regenerate from EA → run
**Apply Markers** → save.

## Privacy

**No telemetry. No network requests. Contracts are never stored.**

Everything runs in the extension host process on your machine. The bundle is
built with the network layer of the conversion engines stubbed out
(`src/no-network-stub.js` replaces `node-fetch`), so an external `$ref` is
reported as an error instead of being fetched — a contract never leaves the
computer. The extension keeps no copy of your files: it only edits the open
buffer or writes where you point the save dialog.

The extension works in
[Restricted Mode](https://code.visualstudio.com/docs/editor/workspace-trust)
(untrusted workspaces) — it executes no workspace code.

## Reporting bugs and security issues

- Bugs and feature requests:
  [GitHub Issues](https://github.com/Beata-Humeniuk/openapi-tools/issues).
- Security issues: see [SECURITY.md](SECURITY.md) — please do not attach
  real contracts or internal API specifications to public issues; a minimal
  synthetic spec that reproduces the problem is enough.

## Contributing / building from source

```bash
git clone https://github.com/Beata-Humeniuk/openapi-tools.git
cd openapi-tools
npm ci
npm test        # conversion round-trips + the full marker vocabulary
npm run build   # bundles src/ into out/extension.js
npm run package # produces openapi-tools-<version>.vsix
```

License: [MIT](LICENSE). Changes are tracked in [CHANGELOG.md](CHANGELOG.md).
