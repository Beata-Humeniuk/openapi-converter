# Security Policy

## Supported versions

Security fixes are released for the latest published version of the
extension. Older versions are not patched separately — please update to the
newest release.

## Reporting a vulnerability

Please use
[GitHub private vulnerability reporting](https://github.com/Beata-Humeniuk/openapi-tools/security/advisories/new)
so the issue is not public before a fix exists. If that is not possible,
open a regular issue **without** the sensitive details and ask for a private
channel.

## What not to post

API contracts often describe internal systems. In any report — public or
private:

- do **not** attach real production contracts, internal API specifications,
  hostnames, or anything under NDA;
- do **not** include credentials, tokens, or personal data.

A minimal **synthetic** spec that reproduces the problem is all that is
needed — a few paths and schemas with made-up names work just as well.

## Scope notes

The extension is designed to run fully offline: it makes no network
requests (the network layer of the bundled conversion engines is stubbed
out), sends no telemetry, and stores no user files. Anything contradicting
that — an observed network request, data written outside the save dialog —
is a security bug; please report it.
