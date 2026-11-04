# Design

## Context

The repository has a separate validation workflow for `dev`, `master`, and pull
requests; it does not publish the extension. `@vscode/vsce` is already pinned
through the lockfile. The `master` branch and external services must not be
changed without a separate request.

## Goals / Non-Goals

**Goals:** separate limited release authorization from ordinary validation;
preserve the source commit and explicit version; document activation.

**Non-Goals:** automatic version changes, Git tags, GitHub releases, transferring
changes to `master`, service setup, and actual publication.

## Decisions

1. A separate workflow runs on push to `master`; the job condition additionally
   restricts the repository and ref. Validation runs before the publication job.
   The publishing job receives `id-token: write` and checks the same commit.
2. `vsce publish --oidc --skip-duplicate` uses the existing development dependency,
   packages the source itself, and does not store a PAT. The user rejected the
   PAT alternative after being told about the limited lifetime of global PATs.
3. Marketplace Trusted Publishing is restricted to the repository, workflow name,
   and GitHub Environment `marketplace`. Only `master` is manually allowed for
   this Environment in GitHub: a YAML check alone does not protect against a
   modified workflow on another branch. The user configures these settings
   before enabling trust and the first publication.
4. Releases are serialized without canceling a running job. The version comes
   from the manifest; `--skip-duplicate` does not compare an existing publication's
   contents with the new commit and does not replace it.

Official sources: [VS Code: secure automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#publish-with-github-actions-and-trusted-publishing),
[GitHub: deployment branches](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments#deployment-branches-and-tags),
[GitHub: concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
Related architectural records are in [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md).

## Risks / Trade-offs

- [Environment not restricted yet] → instructions require configuring GitHub and
  Marketplace before enabling publication; the integration is not ready until then.
- [Version not bumped] → `--skip-duplicate` leaves the previous release unchanged.
- [Tests pass but the extension is not ready] → manual validation and the decision
  to transfer to `master` remain separate user actions.
- [Queue full or provider unavailable] → the error is visible in Actions; the
  infrastructure does not guarantee an unlimited number of pending runs.

## Migration Plan

1. Validate the workflow locally, then deliver it to GitHub with separate authorization.
2. The user restricts the Environment and creates the publisher trust policy.
3. The first real push to `master` with a new version becomes a publication.
   To disable it, the user separately removes the trust policy or workflow.
