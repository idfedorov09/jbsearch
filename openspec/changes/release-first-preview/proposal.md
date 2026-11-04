# Proposal

## Why

The user requested the first public GitHub release and the transfer of the
current development history to the stable branch. Version 0.2.1 is the current
unreleased extension version and there are no existing GitHub releases or tags.

## What Changes

- Prepare the changelog and release notes for a public GitHub preview release
  of 0.2.1, including the existing platform-validation limits.
- Validate the source and package, fast-forward `master` from `dev`, and attach
  the verified VSIX to the GitHub release.
- Let the existing push-triggered workflows run normally, including the
  Marketplace publishing job, as requested after its effect was explained.
- Flag the extension as Preview in Marketplace metadata to match its documented
  status, without changing the version or the publishing workflow.

## Capabilities

### New Capabilities

None. This is a release and documentation change; `skip_specs` is set.

### Modified Capabilities

None. The extension runtime behavior does not change.

## Impact

The user requested a GitHub tag and release, a `master` transfer, and normal
push workflows after being informed that the Marketplace job can publish. The
release is identified as a preview: Linux/X11 has recorded GUI validation;
macOS, Windows, and physical Remote acceptance are incomplete. No workflow or
repository settings are changed.
