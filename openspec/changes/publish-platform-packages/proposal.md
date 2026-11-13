# Proposal

## Why

The platform-specific VSIX matrix is built and checked but the existing gallery
publication routes publish only the universal package. Consequently a real
release does not yet offer the smaller artifacts to either gallery.

## What Changes

- Prepare the existing Marketplace and Open VSX stable and pre-release routes
  to publish the six approved platform packages and the universal fallback.
- Verify each registry's exact extension identity, version, target, channel and
  SHA-256 after upload or a duplicate skip; handle partial publication and
  bounded metadata propagation delays explicitly.
- Retain branch, event, authentication and protected-environment restrictions;
  make retry builds reproducible and document safe investigation and recovery.
- Record the distribution decision and tests without claiming actual gallery
  publication, target selection, or unperformed OS and Remote acceptance.

## Capabilities

### New Capabilities

- `platform-gallery-publication`: Controlled, target-aware publication and
  verification of a platform package matrix in the two extension galleries.

### Modified Capabilities

None. Existing in-progress platform-packaging and beta-publication changes
remain historical records of their own scope and verification.

## Impact

This affects publication workflows, package verification, publisher wrappers,
mock tests and release documentation. It does not change the extension ID,
version, runtime search behavior, or bundled client. The user authorized local
implementation on `dev`; committing, pushing, merging, and actual publication
remain separate actions. The previously published 0.4.4 universal pre-release
is not modified by these local changes.
