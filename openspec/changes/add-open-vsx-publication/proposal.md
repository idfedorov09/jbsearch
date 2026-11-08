# Proposal

## Why

JB Search has a prepared VS Code Marketplace workflow but no GitHub Actions
workflow for Open VSX. The user requested an Action that can publish even the
first Open VSX version, without requiring a manual VSIX upload.

## What Changes

- Add a manually dispatched Open VSX workflow guarded to the stable branch and
  the project repository, with validation before either publication mode.
- Support a restricted bootstrap token for the first version and a separate
  trusted-publishing mode after the extension is active and trust is registered.
- Document setup, activation, failure handling, and subsequent token removal;
  add tests for the workflow and publishing CLI against a local mock registry.

## Capabilities

### New Capabilities

- `open-vsx-publication`: Manual publication of a validated stable-branch VSIX
  to Open VSX with bootstrap and trusted authentication.

### Modified Capabilities

None.

## Impact

The change adds a workflow, the pinned Open VSX CLI as a development dependency,
tests, setup documentation, and an architectural decision. It does not change
the extension's runtime behavior or the existing Marketplace workflow. Creating
remote credentials, transferring code to `master`, running the workflow, and
publishing remain separate user actions. Installation in editors using Open VSX
is not verified by preparing the workflow.
