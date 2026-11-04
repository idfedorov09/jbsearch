# Design

## Context

See proposal.md. The root manifest supplies metadata to the VS Code extension
packager; the README and its media are part of the published package. Existing
OpenSpec capabilities concern runtime behavior and need no delta for this change.

## Goals / Non-Goals

Keep the requested keywords in the main extension manifest and preserve the
existing README presentation. Do not alter runtime search behavior, change the
extension version, or publish a release.

## Decisions

- Remove only the three obsolete GIF TODO comments, leaving the actual hero and
  screenshots intact.
- Use the existing manifest's `keywords` array with the user's requested terms.
  The [extension manifest reference](https://code.visualstudio.com/api/references/extension-manifest)
  documents the field and its 30-keyword limit; the requested list has 11 items.
- Build the test VSIX outside the repository so packaging does not overwrite the
  existing versioned VSIX. Verify its manifest and contents with the existing
  package verifier and inspect the bundled keyword values.

No new ADR is needed because these edits do not change architecture. Existing
decisions remain recorded in [docs/adr](../../../docs/adr/README.md).

## Risks / Trade-offs

- Incorrect or absent packaged keywords → compare the packaged manifest and
  VSIX gallery tags with the source manifest.
- Accidental loss of README media → retain and verify the existing image links.
- Search visibility depends on Marketplace ranking → adding keywords does not
  promise a particular ranking or imply that a release was published.
