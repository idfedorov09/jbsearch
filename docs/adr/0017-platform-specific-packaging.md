# ADR 0017: Platform-specific VSIX packages with a universal fallback

- Status: Accepted
- Date: 2026-11-13
- Relates to: [ADR 0003](0003-search-engine-and-session.md),
  [ADR 0006](0006-remote-preview-theme.md),
  [ADR 0009](0009-open-vsx-publication.md),
  [ADR 0015](0015-beta-push-publication.md)

## Context

The main extension bundles a native ripgrep executable for each of 12
platform/architecture combinations even though a workspace host uses one.
Demonstration GIFs and screenshots also increased the VSIX size. The search
runtime in ADR 0003 and the separate, bundled UI client in ADR 0006 must remain
available; a Remote workspace host can differ from the local UI host.

## Decision

In addition to the existing universal package commands, provide a local and
build-only CI matrix for `win32-x64`, `win32-arm64`, `darwin-x64`,
`darwin-arm64`, `linux-x64`, `linux-arm64`, and a universal fallback. A target
archive declares its VSIX target and contains exactly the corresponding
executable from the pinned dependency. The universal archive has no target and
retains all 12 existing executables. All seven retain the main extension ID,
source version, required resources, and bundled UI client. Stable and
pre-release metadata are built and checked separately.

Exclude repository `images/` illustrations from the VSIX, not the repository.
Preserve the icon and the packaged README's HTTPS references to illustrations.
Archive inspection does not prove that a gallery can render those images or
that they are available offline.

The independent GitHub Actions matrix uploads verified artifacts to its own
workflow run. It does not publish to either registry, supply registry
credentials, or gate the existing publication workflows. The existing `master`
stable and `beta` pre-release publication routes continue using universal
packages. Changing them and distributing a platform matrix require separate
authorization, review of registry selection and partial-failure behavior, and
a suitable new version.

## Alternatives

- Keeping only a universal package preserves the status quo but makes every
  download include binaries for unrelated workspace hosts.
- Removing the fallback, or reducing it to the six target binaries, would
  discard part of the current binary inventory and could strand users.
- Passing only a VSIX target to the packaging tool did not exclude the other
  ripgrep binaries in the experiment. Deleting binaries from `node_modules`
  would risk disrupting source runs and concurrent builds. The matrix instead
  uses temporary package-ignore rules and checks the resulting archives.
- Additional Alpine-specific packages and claims of broader support remain
  deferred until their own acceptance and distribution review.

## Consequences

The target-specific downloads are substantially smaller, while the universal
fallback remains comparatively large. Package verification checks target
metadata, binary inventory and content, executable modes, required resources,
and the channel marker; it does not replace execution in a real editor. An
`npm_config_arch` override can affect the runtime's selected binary and must
agree with the workspace host and installed package. GUI, Remote, gallery,
target-selection, and untested-platform results must be recorded separately.
See [platform packaging validation](../testing/platform-packaging.md).

## References

- [VS Code platform-specific extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions)
- [VS Code remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
- [Platform packaging change](../../openspec/changes/platform-specific-packaging/)
