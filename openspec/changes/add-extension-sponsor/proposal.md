# Proposal

## Why

The README links to the user's Tribute page, but the extension manifest does not
yet expose the same link as sponsor metadata.

## What Changes

- Add the user-provided Tribute URL as `sponsor.url` in the main manifest.
- Verify the exact URL in the source manifest and generated VSIX metadata.
- Record the results and keep the unrelated Social Preview work untouched.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is package metadata only and opts out of spec deltas.

## Impact

The main extension manifest and this OpenSpec change are affected. Runtime code,
dependencies, version, repository settings, and Marketplace publication are
outside scope. The user authorized a commit and push to `dev`.
