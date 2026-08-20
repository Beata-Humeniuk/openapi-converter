# Changelog

This file lists user-visible changes to OpenAPI Converter. The project follows
[Semantic Versioning](https://semver.org/).

## [1.4.0] - 2026-08-20

### Changed

- **A `[example:]` marker on a schema field is written the way OpenAPI 3.1 and
  3.2 ask for it**: `examples: [value]`, the JSON Schema keyword those versions
  put in place of the schema keyword `example`, which they deprecate. Up to
  OpenAPI 3.0 nothing changes — the marker still gives `example`. A converted
  file used to end up stating the same thing in two ways, because the
  conversion moved the values it found into `examples` while the markers kept
  writing `example` next to them. A field that carries the old keyword loses it
  when a marker writes the new one, so an example is never stated twice.
- Editors and validators that only know the OpenAPI 3.0 schema report
  `examples` on a schema as "property not allowed". That is the tool being
  older than the file, not a fault in it: the keyword is what 3.1 and 3.2 ask
  for, and a converted file validates against the official OpenAPI schemas.

### Fixed

- **Markers in the description of a parameter are applied in OpenAPI 3.x**, not
  only in Swagger 2.0. In 2.0 a parameter and its type are one object; from 3.0
  on they are separate, and the markers stayed unread in the description with
  nothing said about it. `[enum:]`, `[format:]`, `[pattern:]` and the other
  validation markers now go into the parameter's `schema`, `[example:]` and
  `[deprecated]` onto the parameter itself, and `[x-…]` extensions stay with
  the parameter, so a Swagger 2.0 contract keeps its parameter markers when it
  is converted upwards. A parameter described by `content` instead of `schema`
  is read the same way, and one that already carries named `examples` keeps its
  `[example:]` marker, with the reason given in the report — the specification
  allows only one of the two fields.
- Converting to 3.1 or 3.2 no longer reaches inside example values. A payload
  that happened to carry a field called `schema`, `example` or `enum` was
  treated as part of the contract and modernized; example values are data and
  are now left exactly as they were.

## [1.3.0] - 2026-08-20

### Changed

- **`[responseCase:]` and `[requestCase:]` are now written out of nested
  parts**, the same `[part: value]` shape the markers themselves have:
  `[responseCase: [code: 200] [name: confirmed] [summary: Confirmed straight away] [exampleBody: {"orderId": "ORD-1"}]]`.
  Nothing is quoted any more — a value runs to its closing bracket — and only
  the marker name has to come first, because every part says for itself what it
  is. This matters most where the contract is generated from a modelling tool:
  the whole description lands inside one string in the file, and the quotes the
  old syntax needed came out escaped and unreadable.
- The syntax used up to 1.2.0 —
  `[requestCase: minimal "Required fields only" {...}]` — is no longer applied.
  Such a marker stays in the description and is listed in the report with the
  shape a case has today, so nothing changes silently, but existing markers
  have to be rewritten. Every other marker is untouched.
- A part given twice in one case, a part the case does not know such as a
  misspelled `[ordre: 2]`, or text left outside `[…]` is refused and named in
  the report, rather than one reading quietly winning.

### Added

- `[order: <n>]` inside a case sets where it lands among the others, whatever
  order the markers were written in. The request body is ordered on its own and
  so is every response code, so `[responseCase: [code: 200] … [order: 1]]` and
  `[responseCase: [code: 400] … [order: 1]]` are each the first case of their
  own code. A case without `[order:]` follows the highest order given so far,
  which leaves files that use none in the order they already had. `[order:]`
  stays in the marker and is never written into the contract.
- `[required]` inside a case builds it from the required fields of the model
  alone — the smallest body the contract accepts, next to a full case showing
  everything it can carry. It reaches nested objects and array items, combines
  with `[schema:]`, and takes its values from the `[example:]` markers already
  on the fields, so nothing is invented. Giving both `[required]` and
  `[exampleBody:]` in one case is refused and reported.

## [1.2.2] - 2026-08-19

### Fixed

- **Convert Version** now offers to save the result next to the file it was
  converted from. The result document carried only a bare file name, which
  Windows resolves against the drive root, so Ctrl+S tried to write
  `C:\name.yaml` and failed with `EPERM: operation not permitted`; only
  **Save As** got the file onto disk. When the target name would be the source
  file itself — converting a YAML contract to YAML — the result is named
  `name.converted.yaml`, so saving cannot overwrite the contract it was made
  from. With no folder to save into, the result opens as a plain untitled
  document and Ctrl+S asks where to put it.
- Markers written next to a `$ref` now survive **Convert Version** from
  Swagger 2.0. OpenAPI 3.0 ignores anything beside a reference, so the
  conversion dropped those descriptions with the markers still in them, and the
  values never reached the converted file. Such a field is now wrapped in a
  one-element `allOf` before the conversion, exactly as **Apply Markers**
  already does when it writes a value beside a reference. Only fields whose
  description actually carries a marker are restructured, and the shared type
  itself is left alone.

## [1.2.1] - 2026-08-19

### Fixed

- A case built from the model now states array fields the way the schema
  promises them. A single value belonging to an array (`[example: "SMS"]`
  written on the array) is wrapped into a one-element list instead of being
  left as a bare string, and a list belonging to an item that is itself an
  array stays one level down instead of being flattened into the outer list.

## [1.2.0] - 2026-08-19

### Added

- `[responseCase:]` and `[requestCase:]` can now take their value from the
  model instead of from JSON written by hand. A case that ends after its name
  and summary is composed from the `[example:]` values already on the fields of
  the body schema, following `$ref` and `allOf` and filling one row per array,
  so a field added to a large request body no longer means editing an example.
  `[requestCase: <name> "<summary>" #<Schema>]` builds from a named schema
  instead of the one on the media type. Fields without an example are left out
  without a word; when no field in the schema carries an example there is
  nothing to build, and the marker is reported and stays in the description
  rather than producing an empty case.

## [1.1.0] - 2026-08-18

### Added

- New `[response: <code> "<description>" #<Schema> {...}]` operation marker.
  It adds a response with a custom status code (including ranges such as `4XX`
  in OpenAPI 3.x, and `default`), an optional description, an optional body
  schema reference such as `#Error`, and an optional JSON example. Missing
  descriptions use the standard HTTP reason phrase. When the response has a
  schema, the example keys are checked against it and unknown keys are
  reported, the same way `[exampleBody:]` reports them.

- New `[responseCase: <code> <name> "<summary>" {...}]` and
  `[requestCase: <name> "<summary>" {...}]` operation markers. They add named
  example cases, so one response code — or the request body — can document
  several scenarios at once, which Swagger UI shows in a dropdown. OpenAPI 3.x
  only; in Swagger 2.0 the marker stays in the description and is reported,
  because 2.0 allows a single example per media type.

### Changed

- One rule now decides where every marker value is written: the version's
  official field if it has one — whatever that field is called — otherwise the
  established `x-` extension, otherwise the marker stays in the description and
  is reported. In Swagger 2.0 this makes `[deprecated]` on a schema write
  `x-deprecated` instead of an invalid `deprecated`, and leaves `[writeOnly]`
  in the description instead of writing a field 2.0 has no room for. Converting
  the file up to 3.x turns such a waiting marker back into the real field.
- `[nullable]` now follows the version of the file. Swagger 2.0 still gets
  `x-nullable` and OpenAPI 3.0 the `nullable` keyword, but OpenAPI 3.1 and 3.2
  state it in the type — `type: string` becomes `type: [string, null]` —
  because 3.1 removed the keyword. The extension previously wrote `nullable`
  there, where those versions ignore it.
- **Convert Version** now applies the markers to the converted file instead of
  to the source, so each marker follows the version you convert to. Converting
  a Swagger 2.0 file upwards applies the markers the newer version has gained,
  such as code ranges and named cases, in a single step. Converting downwards
  applies what the older version still supports and leaves the rest in the
  descriptions. Previously the source version decided, so a marker the target
  supported was dropped and its text was carried into the converted file.

### Fixed

- **Convert Version** now names the result document after the target format, so
  saving it with Ctrl+S proposes `.yaml` instead of `.yml`. An unnamed document
  left the extension to VS Code, which takes the first one registered for the
  language — a YAML extension such as Red Hat YAML registers `.yml` there.
- **Apply Markers** no longer adds a trailing empty line to a file that did
  not end with one.

## [1.0.0] - 2026-08-17

First public release.

### Added

- Convert between Swagger 2.0 and OpenAPI 3.0.x, 3.1.x, or 3.2.x, using JSON
  or YAML. When an older format needs adjustments, the extension shows a
  review summary.
- Move supported markers from descriptions into OpenAPI fields. This includes
  examples, constraints, flags, operation metadata, media types, and vendor
  extensions.
- Run locally without telemetry, network requests, or file storage.
- Support Restricted Mode.
