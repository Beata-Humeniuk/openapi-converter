# OpenAPI Tools

Convert OpenAPI and Swagger files, or move supported description markers into
OpenAPI fields, directly in VS Code.

**No telemetry. No network requests. The extension does not store your files.**

## Commands

| Command | What it does |
|---|---|
| **OpenAPI: Convert Version** | Converts between Swagger 2.0 and OpenAPI 3.0, 3.1, or 3.2. Input and output can be JSON or YAML. |
| **OpenAPI: Apply Markers** | Turns supported `[field: value]` markers in descriptions into OpenAPI fields. |

## Convert a file

| From / to | Swagger 2.0 | OpenAPI 3.0 | OpenAPI 3.1 | OpenAPI 3.2 |
|---|---|---|---|---|
| **Swagger 2.0** | JSON ↔ YAML | Convert | Convert | Convert |
| **OpenAPI 3.0** | Convert* | JSON ↔ YAML | Convert | Convert |
| **OpenAPI 3.1** | Convert* | Convert* | JSON ↔ YAML | Convert |
| **OpenAPI 3.2** | Convert* | Convert* | Convert* | JSON ↔ YAML |

All conversions support JSON and YAML input and output.

\* The target version is older and may not support every feature. The extension
completes the conversion and lists anything adjusted or removed. Your source
file stays unchanged, and you decide whether to save the result.

To convert a file:

1. Open a JSON or YAML file, or right-click it in the Explorer.
2. Run **OpenAPI: Convert Version**.
3. Choose the target version and output format.
4. Review the result in a new tab. Select **Save As** to save it.

## Apply markers

A supported marker in a description becomes an OpenAPI field. The marker is
then removed from the description.

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

Unsupported markers, such as `[TODO: ...]`, remain unchanged. Invalid values
are not applied. Running the command again does not change an already processed
file.

**OpenAPI: Convert Version** applies supported markers before converting the
file. See the [marker reference](docs/MARKERS.md) for all supported markers and
value rules. A complete example is available in
[examples/markers-swagger2.json](examples/markers-swagger2.json).

## Privacy and security

All processing happens on your computer. The extension makes no network
requests, sends no telemetry, and does not download external `$ref` files. It
stores nothing: a result is written only when you save it. Restricted Mode is
supported. The [security policy](SECURITY.md) describes the full scope.

## Installation

Install **OpenAPI Tools** from the Visual Studio Code Marketplace, or download a
`.vsix` file from the
[GitHub releases page](https://github.com/Beata-Humeniuk/openapi-tools/releases)
and run **Extensions: Install from VSIX**.

## Support

Report bugs in [GitHub Issues](https://github.com/Beata-Humeniuk/openapi-tools/issues).
For security issues, and for what must not go into a report, read the
[security policy](SECURITY.md).

[MIT License](LICENSE) · [Changelog](CHANGELOG.md)
