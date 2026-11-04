# First GitHub preview release preparation

## Preparation — 2026-11-04

Prepared GitHub preview release notes for main extension 0.2.1 and selected
`v0.2.1` as the release tag. The unchanged bundled client remains version 0.1.0.
The extension manifest marks its Marketplace listing as Preview. The user
requested the normal push workflows after being informed that the `master`
workflow can publish to Marketplace; no workflow settings were changed.

## Local verification

- `npm run check` passed.
- `npm test` passed 195/195 with no skipped tests.
- `npm run spec:check` passed 23/23.
- `npm audit --omit=dev --audit-level=high` found no vulnerabilities.
- `npm run package` passed and verified 77 main VSIX entries and 31 nested
  client entries; the VSIX manifest contains version 0.2.1 and `Public Preview`.
- No new manual macOS, Windows, or physical Remote testing was performed.
  Previously recorded Linux/X11 GUI checks and the remaining platform limits
  are linked from the release notes and readiness checklist.

The actual status of the GitHub release, remote branches, and Marketplace
publishing job must be verified on GitHub after the external actions; these
local checks do not establish that any publication succeeded.
