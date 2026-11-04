# Proposal

## Why

JB Search is published in the Visual Studio Marketplace, but its README still
describes an unpublished preview and source installation. The user requested
version 0.2.2 as a stable release with a clearer Marketplace presentation.

## What Changes

- Rename the extension's Marketplace display name to
  **JB Search — JetBrains-style Find & Replace**, preserving its extension ID.
- Remove the Marketplace Preview flag and bump the main package and lockfile
  to 0.2.2; leave the unchanged bundled client at 0.1.0.
- Remove the duplicated README icon and preview copy, use a published GitHub
  release badge, and point the public CI badge at `master`.
- Replace the long end-user installation section with Marketplace installation
  and a short Usage section; keep source-development instructions in CONTRIBUTING.
- Record the user's macOS/Linux acceptance separately from automated Linux GUI
  checks. Windows support remains intended; no Windows run has been reported.
- Verify the package, commit and push to `dev`, check its normal CI, then
  fast-forward `master` and observe normal validation and Marketplace publication.
- Prepare the stable GitHub release and its notes and verified download assets.

## Capabilities

### New Capabilities

None. This metadata, documentation, and release change sets `skip_specs: true`.

### Modified Capabilities

None. Search, replacement, shortcuts, and the client protocol are unchanged.

## Impact

The user explicitly requested implementation, commits, pushes, and the verified
0.2.2 transfer to `master`, with the existing publication workflow running normally.
The extension identifier, client component, runtime, and architecture are preserved.
No new ADR or dependency is needed. Windows, physical Remote, WSL, and Dev
Containers acceptance must not be inferred from macOS/Linux or loopback evidence.
