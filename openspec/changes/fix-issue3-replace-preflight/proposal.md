# Proposal

## Why

An unchanged saved result list does not prove that the selected search scope has
not gained, lost, or changed matches. Replace All must not silently modify new
occurrences or operate on an incomplete verification.

## What Changes

- Before Replace All, independently search the complete eligible scope with the
  same effective query, filters, roots, limits, and editor buffers.
- Compare the complete fresh result set and replacement semantics with the
  existing snapshot. Reject differences or uncertain/incomplete checks without
  changing the snapshot or source; direct the user to Rerun Search.
- Retain the existing one-action workflow when the checked set is unchanged.
- Protect both single and bulk replacement against changes between obtaining a
  document's text and recording its version, and while preparing the edit.
- Keep cancellation, limits, errors, excluded binary inputs, dirty and untitled
  editors, and scoped ignore behavior explicit and fail closed on uncertainty.

## Capabilities

### New Capabilities

- `safe-replace-preflight`: verification of the approved occurrence snapshot
  immediately before a bulk replacement.

### Modified Capabilities

- `find-results-panel`: require independent preflight before Replace All and
  preserve the shown snapshot when verification differs or is incomplete.

## Impact

The change affects the search controller, worker completeness diagnostics,
replacement validation, and associated tests. No dependencies, publication,
version bump, query-reset change, or scroll-driven search are intended. Windows,
WSL and physical Remote need independent runtime verification. This change is
approved for implementation; the artifacts themselves are not proof of delivery.
