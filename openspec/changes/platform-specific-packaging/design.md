# Design

## Context

See the proposal for the motivation and the `extension-distribution` delta for
the proposed behavior. Today `npm run package` and `npm run package:pre-release`
produce the same named universal VSIX, and `scripts/verify-package.js` requires
all 12 binaries from `@vscode/ripgrep-universal`. Current publication jobs and
beta verification rely on that universal filename and behavior. In particular,
the Marketplace beta verifier explicitly selects the universal target, and the
Open VSX wrapper validates the expected universal filename.

The installed dependency resolves `bin/<process.platform>-<arch>/rg[.exe]`,
where `arch` can be overridden by `npm_config_arch`. The workspace extension
runs on the workspace host, while the bundled UI client remains a separate
platform-neutral VSIX. Search and preview architecture are recorded in
[ADR 0003](../../../docs/adr/0003-search-engine-and-session.md) and
[ADR 0006](../../../docs/adr/0006-remote-preview-theme.md); existing publishing
boundaries are recorded in [ADR 0009](../../../docs/adr/0009-open-vsx-publication.md)
and [ADR 0015](../../../docs/adr/0015-beta-push-publication.md).

Current local evidence is limited. Excluding `images/` from an experimental
universal 0.4.3 package yielded 24,416,195 bytes; an additional Linux x64-only
experiment yielded 2,836,402 bytes and passed a small worker/ignore-file smoke
test. These are measurements, not released packages or full GUI acceptance.
The `dev` branch currently has its own manifest version; builds MUST derive
identity and version from the checked-out source rather than hard-code 0.4.3.

## Goals / Non-Goals

**Goals:**

- Produce and verify a local seven-artifact matrix without narrowing the
  binary inventory of the universal fallback.
- Keep the current default universal stable/pre-release commands compatible
  with existing local and CI callers.
- Ensure matrix creation never prunes the source `node_modules`, rewrites the
  source ignore file temporarily, or publishes an artifact.
- Preserve the bundled UI client, target-independent runtime behavior, and the
  existing offline runtime binary supply.

**Non-Goals:**

- Publishing to either registry, modifying automatic publication workflows,
  changing credentials or branches, creating releases/tags, or changing a
  version as part of the implementation. Those require separate authorization.
- Declaring new tested-platform support, browser support, or separate Alpine
  artifacts. An `alpine-*` client may receive the universal fallback if its
  gallery and editor select it, but compatibility remains unverified.
- Replacing ripgrep, changing search semantics, downloading executables at
  runtime, or replacing the bundled client bridge.

## Decisions

### 1. One shared identity, six targeted artifacts, and one full fallback

Keep the same extension ID, source version, and requested release-channel
marker across the matrix. Targets map directly to dependency directories:

| VSIX target | Included dependency directory |
| --- | --- |
| `win32-x64` | `bin/win32-x64/rg.exe` |
| `win32-arm64` | `bin/win32-arm64/rg.exe` |
| `darwin-x64` | `bin/darwin-x64/rg` |
| `darwin-arm64` | `bin/darwin-arm64/rg` |
| `linux-x64` | `bin/linux-x64/rg` |
| `linux-arm64` | `bin/linux-arm64/rg` |
| universal | All 12 dependency executables currently present |

The universal archive has no platform-specific `TargetPlatform` in its VSIX
identity. It is not a renamed target-specific archive. A compatible gallery and
editor can prefer an exact target and use universal as fallback. Fallback does
not mean support for arbitrary OSes, web hosts, or an untested architecture.
No private VS Code ripgrep path or external executable is required.

**Alternatives:** A six-binary fallback would reduce its size but discard the
current additional binary inventory. Omitting universal could strand compatible
environments without a listed target. Supplying separate Alpine packages is
deferred until real Alpine acceptance is available.

### 2. Explicit package filtering without touching installed dependencies

Exclude `images/**` in the canonical ignore rules while retaining `media/` and
the explicitly unignored nested client VSIX. For each target, create a
temporary ignore file derived from those canonical rules, add explicit
exclusions for the other 11 ripgrep directories, and pass it to `vsce package`
with `--target` and a distinct output path. Clean temporary configuration on
success and failure. Build the fallback with the canonical ignore file and no
platform target.

Use a separate local matrix command with collision-free output filenames and
stable/pre-release modes. Preserve the existing default universal command names,
output path, and channel behavior so existing publication workflows still find
exactly their expected artifact. Do not leave a platform matrix in a location
where an existing publication glob could accidentally pick it up. The matrix
builder reports target, compressed bytes, and verification status.

**Alternatives:** Passing only `--target` and
`--ignore-other-target-folders` was tried and left all 12 ripgrep binaries in
the archive. Deleting directories under `node_modules` during packaging risks
breaking source execution, concurrent builds, and subsequent packages.

### 3. Verify artifacts against an explicit expected target and channel

Extend package verification to inspect the outer VSIX identity's
`TargetPlatform`, the exact ripgrep binary set, Unix executable bits, and
required runtime resources, including the bundled UI client. A target package
must have exactly the expected binary; a universal package must have the full
12. Reject a missing, mismatched, or extra binary and an unknown target. Check
identity, version, and stable/pre-release markers on every matrix artifact.

Keep the existing verifier's no-argument universal behavior for existing
callers. Test the expected metadata and contents, including negative fixtures
and source integrity after success or failure. A build report states actual
compressed sizes rather than imposing an arbitrary permanent size ceiling.

### 4. Keep README assets in the repository, not the VSIX

The packaged README currently rewrites its relative illustration links to
HTTPS GitHub links. Assert that the images are absent from each VSIX, the
extension icon remains, and the packaged README retains usable HTTPS links;
preserve the source images. A separate real gallery/display check is required:
GitHub access, mutable `HEAD`, offline viewing, and registry rendering are not
proven by a local archive check.

### 5. Separate local packaging from publication

This change only prepares and verifies local artifacts. It does not edit the
automatic publication routes or run a publication. Before any later release,
obtain separate authorization, reconcile `docs/versioning.md` with immutable
artifacts distinguished by extension ID, version, and target, and review both
registries' handling of a same-version matrix. Preserve distinct stable and
pre-release version numbers. Design a recoverable partial-publication strategy
and verify each target and its exact digest/channel as well as fallback and
client selection. An already published version is not silently replaced.

### 6. Add a build-only GitHub Actions matrix

Use a separate workflow with one matrix job per approved target and the
universal fallback. It may run on `dev`, `master`, and `beta` pushes, pull
requests, and manual dispatch; each job builds and verifies one artifact and
uploads it only as a GitHub Actions run artifact. A `beta` branch build or a
pull request targeting `beta` uses pre-release metadata; other builds are
stable. Jobs need read-only repository permission, no registry credentials,
and no publication command. Pin third-party actions to reviewed commits.

The existing `master` stable and `beta` pre-release publication workflows are
not changed, and this separate matrix is not a publication gate. They continue
to use their existing universal artifact until a target-aware publication
change is separately authorized and implemented. Build-only artifacts are not
evidence of publication or real-editor acceptance.

## Risks / Trade-offs

- **A target has the wrong or no executable** → check exact binary set, VSIX
  target, file mode, and use negative fixtures for missing/foreign binaries.
- **A workspace host differs from the UI host** → test selection on the
  workspace host and retain the bundled UI client; do not infer physical Remote
  behavior from a Linux loopback test.
- **`npm_config_arch` overrides host architecture** → cover the resolver's
  existing behavior in tests and document this constraint; never claim a
  different host architecture was tested from archive inspection alone.
- **A client ignores target metadata or chooses fallback** → retain universal
  and separately test actual gallery clients before a release. A fallback install
  remains approximately 23 MiB in the current no-image experiment.
- **Gallery README links depend on GitHub** → retain source assets and perform
  a separately recorded gallery check; do not promise offline illustrations.
- **A target-specific manual VSIX is used on the wrong host** → verify the
  artifact's declared target and document choosing the workspace host. Test
  actual editor rejection separately; a renamed file cannot make the binary
  universal, and archive validation alone cannot identify the eventual host.
- **A release matrix is partially published or uses inconsistent versions** →
  keep publication out of scope now; a separately approved release process must
  verify all targets and define safe retries before any publication is attempted.

## Migration Plan

1. After separate implementation authorization, add local matrix packaging and
   verification while keeping the legacy universal paths operational.
2. Run the automated suite and inspect all stable and pre-release archives;
   perform real VS Code manual checks where environments are available and
   explicitly record missing coverage.
3. Keep the current published artifacts unchanged. Obtain separate approval to
   adapt publication, choose a new release version, and test both galleries.
4. If local matrix packaging is rejected, continue using the existing universal
   package path; no rollback of already published artifacts is implied.

## Evidence and references

- [VS Code: platform-specific extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions)
  documents target-specific VSIX files and universal fallback.
- [VS Code: remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
  describes the UI and workspace extension-host distinction.
- [VS Code: remote Linux requirements](https://code.visualstudio.com/docs/remote/linux)
  describes Alpine and native dependency limitations.
- Repository sources: `package.json`, `.vscodeignore`,
  `scripts/verify-package.js`, `scripts/verify-release-channel.js`,
  `scripts/verify-published-beta.js`, `src/search/index.js`,
  `src/client-preview.js`, and `docs/testing/platform-acceptance.md`.
