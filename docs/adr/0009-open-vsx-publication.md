# ADR 0009: Manual Open VSX publication with a trusted-publishing transition

> [ADR 0018](0018-platform-gallery-publication.md) records the later locally
> prepared target-aware publication design. This ADR retains its historical scope.

> ADR 0015 records the later, explicitly authorized beta-push exception. The
> stable publication routes described here remain unchanged.

- Status: Accepted
- Date: 2026-11-08

## Context

The user requested GitHub Actions publication to Open VSX, including its first
release. Open VSX requires an active extension before a trusted publisher can
be registered. The existing Marketplace workflow and its OIDC policy are
independent of Open VSX; neither authorizes publishing there.

## Decision

A separate workflow is manually dispatched from `master`, validates the source,
and publishes a newly built and verified main VSIX. Its mutually exclusive jobs
use either an Open VSX token for bootstrap or OIDC for trusted publishing. The
token is mapped only to the bootstrap publish step; the trusted job alone has
`id-token: write`. Both jobs require an independently protected `open-vsx`
GitHub Environment. The setup and migration are in
[the Open VSX guide](../open-vsx-publishing.md).

## Alternatives

An OIDC-only workflow cannot publish the first version before the extension
exists. A manual web upload would bootstrap OIDC without a PAT, but would not
meet the requested first publication through GitHub Actions. Keeping a PAT for
all releases is possible but leaves an unnecessary long-lived credential.

## Consequences

The first Action requires a temporary, separately created Open VSX token. Once
an active version and trusted publisher exist, revoke that token and delete its
Environment secret. A YAML branch guard is not a substitute for Environment
branch restrictions, because a modified workflow on another ref could omit it.
The workflow requires an explicit manual dispatch and does not replace an
existing version. Remote setup, publication, and real-editor tests are separate
from locally verified workflow preparation.

## Sources

- [Open VSX: Trusted Publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)
- [Open VSX: Publishing Extensions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions)
- [GitHub: Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
