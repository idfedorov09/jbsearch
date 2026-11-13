# Proposal

## Why

The published universal VSIX contains ripgrep executables for 12 platforms and
large README illustrations, although an installation uses only one executable.
This increases download and installed size without improving the experience on
the current host.

## What Changes

- Provide six local platform-specific VSIX artifacts for `win32-x64`,
  `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, and `linux-arm64`,
  each retaining the matching runtime executable and required resources.
- Retain a separate universal fallback containing all 12 currently bundled
  ripgrep binaries. A fallback preserves the existing binary inventory; it does
  not assert that every architecture, editor, or remote environment is tested.
- Exclude the README GIF and screenshots from every VSIX, keep them in the
  repository, and preserve the extension icon, UI files, and bundled client.
- Verify platform metadata, executable selection, resources, package sizes,
  and stable/pre-release markers without changing the search or Replace logic.
  Preserve the current default universal package commands and their output names.
- Add a separate build-only GitHub Actions matrix for the seven packages,
  respecting the existing stable `master` and pre-release `beta` channel
  distinction without publishing or changing existing publication routes.
- Record matrix build and test instructions, including separate real-editor,
  Remote, gallery-selection, and image-display checks. Treat coverage not actually
  performed as pending, not as completed platform acceptance.

## Capabilities

### New Capabilities

- `extension-distribution`: Local, verifiable platform-specific and universal
  extension packages with the resources required by the target host.

### Modified Capabilities

None. Existing installation, search, and results-panel requirements remain in
force; their behavior is not being redefined by this packaging proposal.

## Impact

Expected implementation areas are package scripts, `.vscodeignore`, package
verification, tests, and English documentation. The extension's ID, user-facing
behavior, bundled client protocol, and runtime search approach remain unchanged.
There is no proposed `web` capability, new Alpine-specific package, or removal
of an existing fallback binary. Alpine and other unusual environments still
require their own acceptance evidence.

The user subsequently authorized implementation on `dev`. Branch transfers,
version changes, publication, credentials, tags, releases, and changes to
automatic publication remain separately authorized actions. In particular,
the existing publication workflows must not be silently repointed to the
matrix. Gallery publication and actual client selection are future acceptance
activities, not outcomes established by this proposal.
