# Proposal

## Why

The search dialog currently renders the full bounded list of skipped file paths
and reasons above the results. The maintainer's screenshot shows this list taking
space away from matches and preview; they explicitly requested its removal.

## What Changes

- Show only aggregate binary-exclusion and incomplete-input diagnostics in the
  modal, without file paths, per-file reasons, or omitted-path messages.
- Keep representative path-and-reason diagnostics in the existing native Find
  Panel and retain all search-completeness and replacement guards.
- Prepare patch version 0.4.1 and a separate issue-linked `dev` to `beta` PR.
  Creating the PR does not itself authorize its merge or publication.

## Capabilities

### New Capabilities

- `search-dialog`: Compact diagnostic presentation in the existing modal search
  dialog, without changing search eligibility or replacement semantics.

### Modified Capabilities

None. The existing `find-results-panel` requirements are unchanged. The earlier
binary-search change's bounded diagnostics remain available in that panel;
this change specializes their modal presentation instead of deleting them.

## Impact

The diagnostic formatter, controller snapshot lifecycle, modal renderer, tests,
README, and release metadata are affected. No dependencies, client component,
native modal adapter, publication workflows, or replacement algorithms change.
Automated UI checks do not establish native VS Code or Windows/WSL acceptance.
The request authorizes implementation and the follow-up PR; published 0.4.0 and
`master` must remain unchanged.
