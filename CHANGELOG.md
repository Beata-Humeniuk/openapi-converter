# Changelog

This file lists user-visible changes to OpenAPI Converter. The project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- New `[response: <code> "<description>" {...}]` operation marker. It adds a
  response with a custom status code (including ranges such as `4XX` in
  OpenAPI 3.x, and `default`), an optional description, and an optional JSON
  example. Missing descriptions use the standard HTTP reason phrase. When the
  response has a schema, the example keys are checked against it and unknown
  keys are reported, the same way `[exampleBody:]` reports them.

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
