# Design

> Historical stable-publication design. The explicit beta exception is recorded
> in `add-beta-publication`; the stable routes described here remain unchanged.

## Context

The namespace is owned, but Open VSX requires an active published extension
before an OIDC trusted publisher can be registered. The user wants even the
first publication to go through GitHub Actions. A first release therefore needs
an Open VSX access token; later releases can use trusted publishing.

## Goals / Non-Goals

**Goals:** manual stable-branch publication, verified VSIX contents, restricted
credentials, and a documented migration to OIDC without storing a permanent PAT.

**Non-Goals:** automatic publication, changing the Marketplace workflow, version
bumps, Git operations, remote configuration, real publication, or claims of
editor/platform compatibility.

## Decisions

1. A separate `workflow_dispatch` workflow accepts `token` or `trusted` and
   restricts every job to `idfedorov09/jbsearch` and `master`. An explicitly
   prepared GitHub Environment `open-vsx` must also restrict deployment branches;
   a workflow condition alone is not a security boundary.
2. A check job runs installation, checks, tests, spec validation, and packaging.
   Each mutually exclusive publication job rebuilds and verifies its own VSIX
   after `npm ci --ignore-scripts`, then passes that file to the pinned `ovsx`
   CLI. This avoids a cross-job artifact transfer and keeps the published package
   verified on the publishing runner.
3. The bootstrap job receives `OVSX_PAT` only in the publish step and fails if it
   is missing; it does not receive OIDC permission. The trusted job gets
   `id-token: write`, receives no PAT, and requires `--trusted-publishing`.
   Both use the separately protected Environment.
4. One shared concurrency group serializes releases. The CLI reports duplicate
   versions as failures instead of silently implying that an existing version
   was updated. No commit, version bump, Git tag, or external setup is performed.

## Risks / Trade-offs

- The bootstrap PAT is sensitive and potentially long-lived. Use an Environment
  secret, then revoke the token and delete the secret after trust is configured.
- The owner must create and restrict the Environment before adding the secret
  or registering trust; GitHub can create a missing Environment without rules.
- Manual dispatch is available only after the workflow exists on GitHub's default
  branch, and `master` deployment requires separate authorization.
- A static workflow or mock-registry test does not verify real GitHub/Open VSX
  permissions, scanning, installation, or execution in any target editor.

## References

- [ADR 0009](../../../docs/adr/0009-open-vsx-publication.md)
- [Open VSX trusted publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing)
- [GitHub: deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
