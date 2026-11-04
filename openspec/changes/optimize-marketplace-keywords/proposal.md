# Proposal

## Why

Improve discovery of JB Search in the Marketplace using the owner's requested
search terms, while retaining the established brand and concise description.

## What Changes

- Add the requested relevant search phrases to the existing keywords without
  duplicates or exceeding the Marketplace limit of 30 keywords.
- Keep the display name, short description, extension ID, publisher, runtime,
  and bundled client unchanged.
- Prepare version 0.2.3 in the main manifest and lockfile, document the release,
  verify the package, and publish through the ordinary `dev` to `master` flow.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This metadata-only release has no specification deltas.

## Impact

The main manifest, lockfile, changelog, release notes, and this change record
are affected. No runtime code or architectural decisions change. The user
requested commits, pushes, a stable GitHub release, and normal Marketplace
publication; do not wait for Marketplace or CI after the `master` push.
