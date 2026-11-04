# Stable 0.2.2 release preparation

Prepared on **November 4, 2026** from `dev`.

## Changes

- Main extension 0.2.2 has the display name **JB Search — JetBrains-style Find
  & Replace**, preserves `idfedorov09.jbsearch`, and removes Marketplace Preview.
- README uses Marketplace installation, a short Usage section, stable release
  and `master` CI badges, and no duplicated large icon or preview copy.
- Source registration and VSIX development instructions remain in CONTRIBUTING.
- User-reported macOS/Linux acceptance is recorded separately from automated
  Linux/X11 checks in [platform acceptance](../../../docs/testing/platform-acceptance.md).
  Windows execution and physical Remote acceptance have not been reported.
- The runtime, client protocol, bundled client 0.1.0, and workflows are unchanged.

## Verification

- `npm ci` passed on Node.js 22.23.2 and npm 12.0.2.
- `npm run check` passed.
- `npm test` passed **195/195**, with no failures, skips, or cancellations.
- `npm run spec:check` passed **24/24** with strict validation.
- `npm audit --omit=dev --json` found no known production vulnerabilities.
  The full development audit reports two moderate entries for the same
  `minimatch` advisory through `@vscode/vsce`; these tools are excluded from the
  distributed VSIX. Dependency versions were not changed for this release.
- `npm run package` passed: **77** main VSIX entries and **31** nested client
  entries; runtime dependencies, all bundled search executables, and client
  build metadata were verified.
- Main package JSON and VSIX XML both contain the requested display name,
  version 0.2.2, and the original extension ID. Gallery flags are `Public`,
  with neither Preview nor Marketplace PreRelease metadata.
- The packaged README has Marketplace installation, Usage, stable release and
  `master` CI badges, and no duplicated top icon or Preview build/version copy.
- Comparing with the 0.2.1 release VSIX found only four changed entries:
  package metadata, VSIX XML, README, and changelog. All runtime resources and
  the bundled client package are identical.

Package evidence: [stable-022-package-results.json](../../../docs/testing/stable-022-package-results.json).
These local checks do not establish external publication or a new manual GUI run.

## Delivery

The agreed sequence is a normal `dev` push and successful Check, followed by a
fast-forward and normal `master` push. Both Check and Publish VS Code Extension
must run normally. The verified stable GitHub release uses the same commit,
with a VSIX download and SHA-256 checksum. Confirm remote refs, workflow results,
release metadata, and public Marketplace metadata separately before reporting
delivery as successful.
