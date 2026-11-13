# ADR 0015: Verified beta-push publication

> [ADR 0018](0018-platform-gallery-publication.md) records the later locally
> prepared target-aware publication design. This ADR retains its historical scope.

- Status: Accepted
- Date: 2026-11-12
- Amends: [ADR 0005](0005-marketplace-trusted-publishing.md),
  [ADR 0009](0009-open-vsx-publication.md)

## Context

The user authorized a beta from verified `dev` history using the same extension
ID in both registries. Stable `master` routes remain as previously decided:
Marketplace on push or manual dispatch, Open VSX on manual dispatch. A beta
is not stable acceptance, and no real-editor platform result is implied.

## Decision

The existing workflow files and environments gain one narrow exception: a
non-deletion, non-force `beta` push may publish a pre-release after checks.
`dev`, pull requests, tags, other repositories, and manual beta dispatch do not
publish it. Environment branch rules independently allow exact `master` and
`beta`; write access to either allowed branch carries publisher authority. All
changes must reach beta through a reviewed `dev` → `beta` pull request linked to
the relevant issue without automatically closing it. The workflow does not
itself prove pull-request provenance, so branch restrictions and process must
enforce that separately.

Both CLIs consume an already packaged and checked outer VSIX with the real
pre-release marker. Builds derive `SOURCE_DATE_EPOCH` from the triggering commit
before building the nested client or outer package. A successful upload or
skipped duplicate is not sufficient: each registry's exact ID, numeric version,
channel marker, and SHA-256 must match the built artifact. Failure may occur
*after* publication and requires investigation, not overwrite or unpublishing.

Marketplace retains its OIDC route. Beta Open VSX intentionally uses the
existing token mode; the stable trusted route remains an explicit choice, with
no automatic credential fallback. The pinned `ovsx` 1.3.0 can place a PAT in a
URL query when its registry-version lookup fails. Token jobs therefore execute
that same CLI inside a process-local HTTP/HTTPS guard that admits only the
expected request form, public registry origin, and safe size-limit query. It
rejects userinfo, other queries, cross-origin redirects and unknown request
forms before the request leaves the process, suppresses untrusted CLI messages,
and fails closed if CLI assumptions change. Local synthetic-token mock tests
exercise the actual CLI and redirects; they are not a real publication. The
unchanged stable trusted route is outside this guard and the CLI's fallback can
also affect its exchanged short-lived token; it is not represented as hardened.

## Alternatives

A different beta extension ID would split installations and was not requested.
A custom REST publisher would add a second publishing implementation. Using the
CLI without the guard risks exposing the token in a URL during an outage; a
preflight request alone cannot prevent the subsequent CLI request from failing.

## Consequences

A later stable version must be numerically distinct from and higher than the
pre-release to update prerelease subscribers. Open VSX `latest` can resolve to a
higher prerelease; this does not establish how every client installs updates.
Beta pushes become public release actions and need verified source, environment
rules and explicit authorization. The guard is deliberately tied to pinned CLI
behavior and must be re-reviewed if the CLI or registry protocol changes.

## References

- [Microsoft: pre-release extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions)
- [Open VSX: publishing extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)
- [Open VSX: trusted publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)
- [GitHub: deployment branches and tags](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags)
