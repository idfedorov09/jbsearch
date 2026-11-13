# Tasks

## 1. Occurrence identity

- [x] 1.1 Implement reliable and ambiguous change tracking, preserving snapshot IDs/order, with unit tests for duplicates, collapsed matches and Undo/Redo.
- [x] 1.2 Implement unknown-identity invalidation and safe worker reconciliation, with external-change and regex/captures regression tests.

- [x] 1.3 Inspect pinned JetBrains occurrence, marker, replacement and Save implementations and record the compatible adaptation and platform limits.

## 2. Replacement safety

- [x] 2.1 Implement a shared individual replacement guard for document state and exact UTF-16 range representability; test CRLF, zero-width and surrogate boundaries.
- [x] 2.2 Apply the guard and reject stale result actions in the controller; test version/hash, stale worker responses and replacement races.

- [x] 2.3 Implement guarded observed-Save lazy state-equality rebase, preserved link policy, bounded lossless disk reads and a physically retained FS preparation gate; test encoding and asynchronous races.
- [x] 2.4 Implement initial clean/dirty/Open Editors authority and independent dirty-buffer disk baselines, including zero-match clean caches, unavailable inputs and pre-read size bounds.

## 3. User-visible status and design

- [x] 3.1 Share tracked occurrence validation with the modal and panel, preserving query reset and selection; test minimal statuses and preview behavior.
- [x] 3.2 Record the architectural decision and actual validation boundaries in ADR 0012 and relevant documentation; validate OpenSpec.

## 4. Integration verification

- [x] 4.1 Run `npm run check`, `npm test`, `npm run spec:check`, and `npm run package`; record results and integration limitations.
- [x] 4.2 Run a real Chromium scenario for the affected webview UI and separately report whether a real VS Code Extension Development Host was available.
- [x] 4.3 Document a separate Windows/WSL/Remote acceptance checklist without claiming unperformed checks.

- [x] 4.4 Rerun final local check/test/spec/package/diff verification after the authority changes and record the exact local versus joint/native boundary.

Combined candidate note (2026-11-11): tasks 2.2/3.1 are now exercised through
the composed controller, immutable backend/provider admission, real filesystem
authority tests and modal VM/Chromium regressions; the full combined Node run
passed 652 tests on historical candidate-1. Candidate-2 records 757 passing Node
tests after nine independent-review repairs. This records implementation and
automated evidence, not completed independent review,
real native painting, EDH or Windows/WSL/Remote acceptance; see
[the combined regression report](../../../docs/testing/issue-3-integrated-regressions.md).

## Candidate-1 review implementation repairs (candidate-2)

- [x] 5.1 Retain accepted raw disk observations separately from historical provenance and Save tickets; verify sequential surviving Singles, known deltas, changed disk, Close and no destroyed-row revival.
- [x] 5.2 Positively renew completed document/Save/current-observation authority across confirm/new/same-owner transfer, retain original pending deadlines and fail closed for unrenewable proof; test real tempfile/worker routes.
- [x] 5.3 Bound modal renderer reads after asynchronous loading; verify oversized-length zero-read spies, growth during load and bounded INVALID inspection.

These checkboxes record implementation and 757 passing combined Node tests, not
independent re-review or native/platform acceptance. Existing designated
review/native tasks remain open; see the candidate-2 regression report.
