# Proposal

## Why

The README still contains obsolete GIF TODO comments beside the completed demo
screenshots. The extension manifest has no keywords describing its search and
replace workflow.

## What Changes

- Remove the three obsolete TODO comments from the root README while preserving
  its demo images and other content.
- Add the requested search, replace, JetBrains, and productivity keywords to the
  main extension manifest.
- Verify the manifest, README, tests, OpenSpec, and packaged extension.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This changes documentation and package metadata, not search behavior;
the change opts out of spec deltas with `skip_specs: true`.

## Impact

The main README and `package.json` change. Runtime code, client package,
dependencies, version, and existing architecture remain unchanged. The user
authorized committing and pushing this work to `dev`; Marketplace publication
is outside scope.
