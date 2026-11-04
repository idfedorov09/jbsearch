# Design

## Context

See proposal.md. The user supplied the same HTTPS URL already used by the
README donation buttons. The main extension manifest is the package source.

## Goals / Non-Goals

Expose that exact URL as sponsor metadata, without changing the README, client,
version, runtime behavior, or repository settings. No payment or publication
is part of this task.

## Decisions

- Add `sponsor.url` to the main `package.json`, preserving the query string.
  The [VS Code extension manifest reference](https://code.visualstudio.com/api/references/extension-manifest)
  documents sponsor metadata.
- Build a test VSIX outside the repository to preserve existing packages, then
  check both the packaged manifest and `Microsoft.VisualStudio.Code.SponsorLink`.
- Keep the separate Social Preview files outside this change and its commit.

This does not change architecture; existing decisions remain in
[docs/adr](../../../docs/adr/README.md).

## Risks / Trade-offs

- A malformed or altered URL could point to the wrong destination → compare the
  exact URL in the source manifest, README, and packaged metadata.
- Package verification does not prove a live Marketplace or VS Code UI display →
  record that boundary and do not claim a publication or payment.
