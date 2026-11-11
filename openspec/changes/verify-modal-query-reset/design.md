# Design

## Context

See [the proposal](proposal.md). The controller clears a session and invalidates
its generation before scheduling a search; the webview also clears optimistically
while search-affecting input is awaiting acknowledgement. Those are separate
boundaries and both need coverage. The native panel's completed snapshot policy
is separate ([ADR 0007](../../../docs/adr/0007-find-window-and-native-editor.md)
and [ADR 0008](../../../docs/adr/0008-native-find-panel.md)).

## Goals / Non-Goals

The checks and focused fixes prevent stale results, accessibility references or
previews after rapid modal input. They do not add retention, a new search
architecture, native panel changes, or cross-branch integration. The original
test-only milestone remains inherited evidence, not a current execution claim.

## Decisions

- Use independent controller regression tests with controllable async search and
  preview promises. This exercises generation checks, abort, current input and
  result ownership without relying on wall-clock ordering.
- Exercise the real production webview in headless Chromium with a mocked VS Code
  message boundary, separately from Node unit tests. The VS Code API documents
  webview messaging and explicitly does not equate a successful `postMessage`
  with receipt: https://code.visualstudio.com/api/references/vscode-api#Webview.
- Preserve replacement-only input without scheduling another search, and test
  optimistic query, mask and scope changes without waiting for a host reply.
- Keep browser tests independent of installed extensions and user profiles. A
  real VS Code Extension Development Host remains a separate manual check.
- Publish `generation`, `previewRevision`, `previewRequestId`, and per-row
  `resultRevision` at the modal boundary. The monotonically increasing render
  revision rejects superseded asynchronous opens/tokenization; the opaque
  per-client selection request distinguishes rapid A-to-B-to-A selection before
  host acknowledgement. Automatic/theme preview refresh preserves the current
  selection request. Reset clears it. These are not replacement approval tokens.
- Accept preview messages only for the selected current row with exact
  generation, row revision, render revision and request binding. Check liveness
  after document open and preview rendering; a changed document version or an
  obsolete failure cannot publish state. Reject older generation/render-ticket
  state echoes without losing current pending parameter edits.
- Remove `aria-activedescendant` whenever the selected row is absent or outside
  the virtualized rendered window. Do not scroll a selected row into view merely
  to keep an accessibility reference; ordinary keyboard selection still reveals
  its row and restores a valid reference.
- Clear preview name, path, note, content and scroll on reset or empty/error
  results. Replacement-only patches retain results, selection and preview.
- The pinned JetBrains popup delays clearing until its first fresh row (or empty
  completion/validation reset); the user's immediate-clear decision intentionally
  differs. Adopt cancellation/request-identity checks, not the retained-old-row
  policy. Record primary-source inspection separately from real GUI testing.

## Risks / Trade-offs

- A mocked transport cannot establish workbench or Remote behavior -> report the
  browser environment and real VS Code/Windows/WSL boundaries separately.
- Existing issue #3 work is parallel in independent branches -> coordinate
  expected interfaces and defer integration claims until branches are integrated.
- Preview and replacement bindings could be conflated -> keep separate field
  ownership and test their composition only after controlled integration.
- New tests could claim joint behavior from independent branches -> keep the
  acceptance matrix pending until an actual combined run and report platform
  boundaries separately.

## Migration Plan

No persisted-state migration: sessions and preview tickets are in memory. Both
ends of the webview message boundary ship together; unbound preview payloads are
rejected rather than silently interpreted as current. Remove or revise the added
tests only through an explicit future change to the modal's agreed behavior.
