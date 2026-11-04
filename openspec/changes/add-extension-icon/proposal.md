# Proposal

## Why

The user supplied an SVG and authorized adding it as the extension icon,
committing, and pushing to `dev`. The main extension currently has no manifest icon.

## What Changes

- Preserve the source SVG and export a 256×256 PNG without changing the artwork.
- Reference the PNG through `icon` in the main `package.json` and verify it in the VSIX.
- Update the changelog and outdated statements that the icon is missing.

## Capabilities

### New Capabilities

No new features: this changes artwork, manifest metadata, and package verification.

### Modified Capabilities

Search and panel contracts remain unchanged; `skip_specs: true`.

## Impact

The main manifest, PNG, source SVG in documentation, package verifier, and documentation.
Runtime, dependencies, client bundle, and version `0.1.0` remain unchanged.
Publication and transfer to `master` are outside the scope.
