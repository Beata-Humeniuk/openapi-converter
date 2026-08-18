# Changelog

This file lists user-visible changes to OpenAPI Converter. The project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
