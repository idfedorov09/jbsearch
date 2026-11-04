# Tasks

## 1. Metadata and release preparation

- [x] 1.1 Add the requested unique keywords, bump the main version to 0.2.3, and verify identity, description, keyword limit, and lockfile consistency.
- [x] 1.2 Update the changelog and prepare concise stable release notes; review against the actual metadata and unchanged runtime.

## 2. Verification

- [x] 2.1 Run checks, tests, strict OpenSpec validation, and package verification; inspect packaged metadata and tags and compare packaged runtime files with 0.2.2.

## Manual validation

No new manual VS Code GUI or cross-platform run is claimed for this metadata-only
release. Existing platform evidence remains in `docs/testing/platform-acceptance.md`.

## Workflow follow-up

- Commit and push `dev`, fast-forward and push `master` normally, and create
  stable GitHub release `v0.2.3` at that commit with the verified VSIX and checksum.
- Do not wait for Marketplace publication or CI after the `master` push.
