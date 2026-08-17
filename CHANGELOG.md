# Changelog

All notable, user-visible changes to the OpenAPI Tools extension are
documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [1.0.0] — unreleased

First public release.

### Added

- **Convert Version** command: converts Swagger 2.0 ↔ OpenAPI 3.0.x ↔ 3.1.x
  ↔ 3.2.x in every direction, JSON or YAML in and out, with a warning report
  for every approximated or dropped element on lossy downgrades.
- **Apply Markers** command: moves `[field: value]` markers written in
  descriptions (e.g. Enterprise Architect notes) into the real OpenAPI
  fields they name — examples, formats, patterns, enums, bounds, flags,
  operation metadata, media types and vendor extensions — deterministically
  and idempotently.
- Fully local operation: no telemetry, no network requests, no storage of
  user files; works in untrusted workspaces (Restricted Mode).
