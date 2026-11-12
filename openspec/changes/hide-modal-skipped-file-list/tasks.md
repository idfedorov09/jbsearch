# Tasks

## 1. Compact diagnostic presentation

- [x] 1.1 Add summary-only formatting while retaining detailed/default output and fail-closed classification; verify exclusions, blockers, inconsistent data, and overflow with formatter tests.
- [x] 1.2 Carry the summary through creation, snapshots, reset, transfer, and rollback; verify controller lifecycle and stale-generation regression tests.
- [x] 1.3 Render only the summary in the modal without detailed fallback; verify plain-text output, empty state, general warnings, Rerun, and replacement guards in UI tests, and document the retained Find Panel detail route in README.

## 2. Follow-up release preparation

- [x] 2.1 Prepare 0.4.1 metadata and release notes without changing client 0.1.0 or publication workflows; verify package/lock agreement and document the presentation-only patch judgment.
- [x] 2.2 Record a separate real VS Code manual checklist and actual execution status in a testing note, explicitly distinguishing automated checks from native/platform acceptance.

## 3. Integration verification

- [x] 3.1 Run code checks, the full Node suite, strict OpenSpec validation, stable and marked pre-release packaging, and diff checks; record their actual results.
- [x] 3.2 Obtain independent review of the final change, resolve confirmed findings, and prepare an issue-linked dev-to-beta PR without merging or publishing.

## Workflow follow-up

- Sync or archive verified requirements only after review; do not change unrelated draft specifications.
- Merging the PR triggers publication and requires separate release authorization.
