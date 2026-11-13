# Proposal

> Historical stable-publication design. The explicit beta exception is recorded
> in `add-beta-publication`; the stable routes described here remain unchanged.

## Why

Releasing JB Search needs an automated process that takes validated source from
`master` and publishes new versions to VS Code Marketplace without manually
preparing and uploading a VSIX.

## What Changes

- Add a GitHub Actions workflow that publishes from `master` after validation.
- Use Marketplace trusted publishing through GitHub OIDC without a PAT.
- Use the version specified in `package.json` and skip an already published
  version; do not modify files or create tags automatically.
- Document separate publisher and protected GitHub Environment setup, and the
  boundary between preparing a workflow and actual publication.

## Capabilities

### New Capabilities

- `marketplace-publication`: a verifiable extension release process for
  Marketplace using source from a protected branch.

### Modified Capabilities

None.

## Impact

GitHub Actions, project documentation, and Marketplace publisher settings are
affected. The user approved implementing the workflow; commits, push, transfer
to `master`, external service setup, and the first publication are outside this
scope. Packaging does not change the extension's supported platforms. Manual
extension checks in VS Code and actual Marketplace release operation must be
recorded separately.
