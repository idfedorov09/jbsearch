# ADR 0018: Verified platform matrix publication

- Status: Accepted for local workflow implementation
- Date: 2026-11-13
- Extends: [ADR 0009](0009-open-vsx-publication.md),
  [ADR 0015](0015-beta-push-publication.md),
  [ADR 0017](0017-platform-specific-packaging.md)

## Context

ADR 0017 provides seven locally verified VSIX files but did not change the
publication routes. The published 0.4.4 pre-release contains only the universal
file on each gallery. A gallery can treat each extension ID, version, and target
as a separate artifact; publishing one target does not publish the others.

## Decision

Prepare both existing release workflows to build the full matrix and publish
universal first, then each of the six explicit targets, sequentially. Check all
packages and release markers before the first upload. After every upload or
duplicate skip, confirm the exact registry record's ID, version, target, channel
and digest, including for stable releases. Check Open VSX's exact-target API;
never accept a universal response as a platform-specific match. Use bounded
retries for gallery propagation, and report confirmed, uncertain and unattempted
targets on failure. No publication is atomic or rolled back automatically.

Set `SOURCE_DATE_EPOCH` from the checked-out commit before preparing the nested
client and the outer package for both channels. The nested client cache records
the epoch and is rebuilt if it changes. CI uses clean runners with pinned
dependencies, but reproducible bytes still depend on identical source, Node,
tooling and environment. Compare digests on retry instead of assuming them.

Keep existing master/beta event restrictions, protected environments, Marketplace
OIDC, and explicit Open VSX token versus stable trusted routes. The pinned token
CLI remains behind the fail-closed HTTP guard. Its trusted route remains outside
that guard; ADR 0015's warning about temporary token URL fallback still applies.

## Alternatives

Publishing only six small packages could remove support provided by the existing
universal inventory. Publishing seven concurrently would make partial failures
harder to interpret and could leave no fallback during the first uploads. Upload
success or a CLI duplicate skip alone does not verify remote bytes. A script
which overwrites or unpublishes conflicting artifacts would violate immutable
release expectations.

## Consequences and limits

A fallback-first failure may still expose a partial release. Investigate each
registry and preserve run records before retrying; do not infer that a failed
job performed no upload. Stable and pre-release still require distinct numeric
versions. Project policy uses a new higher version for a future release rather
than silently altering 0.4.4. Deployment, protected-environment settings and
actual publication require separate authorization. Local tests do not establish
GitHub Actions execution, gallery client selection, native OS support or Remote
acceptance. It is not established whether a client with universal already
installed will switch to a newly added target at the same version. The previously published 0.4.4 remains universal-only.

## References

- [VS Code platform-specific extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platform-specific-extensions)
- [Open VSX registry API](https://github.com/eclipse-openvsx/openvsx/wiki/Registry-API)
- [Open VSX publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)
- [Platform gallery publication change](../../openspec/changes/publish-platform-packages/)
