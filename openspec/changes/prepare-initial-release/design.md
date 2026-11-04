# Design

## Context

See proposal.md. Main/client already have `0.1.0`; the local package and GUI have
been checked. `origin/dev` still contains only the `0.0.1` scaffold. Publish/check
jobs use different runners: the bundle built in check does not automatically
reach publish.

## Goals / Non-Goals

**Goals:** a reproducible VSIX with the client component, accurate documentation
of the current candidate, and verified history in `dev`.

**Non-Goals:** actual publication, external credentials/Environment, merging to
`master`, new platform promises, runtime/API changes, or a version change.

## Decisions

1. Keep `0.1.0`: this is the already prepared first functional release after the
   `0.0.1` scaffold. Another bump does not fix source registration.
2. Explicitly run `npm run package` on the publish runner, including prepare:client
   and verify-package; pass the verified VSIX through `--packagePath`. Passing an
   artifact between jobs is possible but adds unnecessary mechanisms for this
   small distribution. Preserve the ADR 0005 and existing publication spec
   contract; check commands against local `vsce publish --help`.
3. Separate the user-facing changelog from the developer release checklist.
   Update limits and the OpenSpec overview. Synchronize only verified
   installation-check and find-results-panel requirements; do not transfer the
   old HTML-tree placement or unfinished platform plans to the baseline or archive them.
4. Run npm ci/check/test/spec/package and verify packaging from the Git tree.
   Keep VSIX and generated bundles out of Git, then push related commits to `dev`.
   Wait for the GitHub Check for the exact pushed HEAD; address CI findings with
   ordinary follow-up commits, without force push.

Rationale: [ADR 0005](../../../docs/adr/0005-marketplace-trusted-publishing.md),
[ADR 0008](../../../docs/adr/0008-native-find-panel.md),
[package verification](../../../scripts/verify-package.js).

## Risks / Trade-offs

- Untested macOS/Windows/Remote → leave the original change's open items intact
  and state the candidate's boundaries explicitly in the release checklist.
- Accumulated uncommitted work → inspect staging contents, exclude VSIX,
  secrets/personal information, and do not change the neighboring BL project.
- The publication workflow is already prepared → preserve master/repository
  guards; pushing `dev` runs only ordinary checks.

## Migration Plan

After the agreed preparation, the user receives commits in `origin/dev` and a
local VSIX. Agree on the next release/transfer to `master` separately after
platform acceptance. Use an ordinary revert if rollback is needed; do not rewrite
remote branch history.
