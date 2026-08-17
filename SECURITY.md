# Security Policy

## Supported versions

Security fixes are provided for the latest published version.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Beata-Humeniuk/openapi-tools/security/advisories/new).
If private reporting is unavailable, open a public issue without sensitive
details and ask for a private contact method.

## Protect sensitive data

Do not include real API contracts, internal hostnames, credentials, tokens,
personal data, or confidential information in a report. Use a small synthetic
OpenAPI file with invented names and values.

## Security scope

OpenAPI Tools runs locally. It does not make network requests, send telemetry,
or store user files. External `$ref` files are not downloaded.

Please report any unexpected network request or file write. Saving a result
through the VS Code save dialog is expected behavior.
