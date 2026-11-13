# Proposal

## Why

Issue #3 exposed risks around search refresh and late asynchronous messages.
The user explicitly chose to keep the modal's existing immediate reset when
the query, mask, scope, or other search parameters change. Independent regression
checks should guard that decision while neighboring changes are developed.

## What Changes

- Add focused controller and webview regressions for immediate clearing,
  selection, preview and scroll reset, search generations, cancellation, and
  late batches, completions and previews.
- Exercise the production webview in real Chromium with a synthetic VS Code
  messaging boundary, and document what that does and does not verify.
- Fix dangling accessibility selection references and bind preview delivery to
  the query generation, result revision and explicit selection/render request.
- Preserve replacement-only input behavior, normal keyboard selection and the
  current immediate-clear UX, including invalid and zero-result queries.
- Own a concise joint acceptance matrix for reset across file events, tracked
  edits, replacement preflight and frozen review; leave joint execution pending
  until the coordinator authorizes controlled integration.

## Capabilities

### New Capabilities

- `modal-query-reset`: immediate reset and stale-message rejection at the modal
  controller/webview boundary, including accessibility and read-only preview.

### Modified Capabilities

None. Existing modal search behavior and its requirements are not changed.

## Impact

The original test-only milestone is inherited evidence. The November 11, 2026
continuation explicitly authorizes focused controller/webview fixes, updated
tests and documentation; it adds no dependency, version or distribution change.
Preview tickets are distinct from immutable replacement-action bindings owned
by neighboring work. A browser harness is not a VS Code Extension Development
Host, Windows, WSL, or Remote test. Cross-branch integration is separately gated.
