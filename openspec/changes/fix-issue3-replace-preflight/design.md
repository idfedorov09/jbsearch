# Design

## Context

Before this change the controller applies `session.results` after document-level checks;
new matches do not enter a saved snapshot. Search workers enumerate eligible
files with ripgrep and match text with ECMAScript. See the proposal and ADR 0003.

## Goals / Non-Goals

**Goals:** independently check current eligible occurrences, preserve the shown
snapshot on refusal, and detect changes while constructing both replacement forms.

**Non-Goals:** a filesystem-wide transaction, automatic snapshot refresh, a
mandatory confirmation for reliably bound actions, scroll-driven search, or
changes to query reset semantics. An exceptional frozen review is required only
when an action has no trustworthy client model binding.

## Decisions

- Capture the effective request and operation identity, then run a separate
  worker without forwarding its batches to the session. Compare occurrences as
  order-independent multisets of URI, current range, text and captures; identical
  query, replacement options and document EOL yield identical replacement meaning.
- Reject cancelled, incomplete, failed and changed verifications. Preserve
  intentional binary exclusions and the established ignore policy; unknown dirty
  buffer eligibility and conditional-exclusion errors are not safe exclusions.
- Read text and version synchronously before any metadata await; recheck the
  document versions, session state, effective scope and available event revisions
  immediately before submitting one text-only WorkspaceEdit.
- Limit worker search and replacement preparation independently. The cumulative
  preparation budget defaults to 60000 ms (`replace.prepareTimeoutMs`,
  100–300000 ms) and is paused while the worker uses `search.timeoutMs`. Before
  dispatch, timeout or cancellation must not cause a late edit; after dispatch,
  retain the lock until the actual WorkspaceEdit outcome is known.
- New or removed scope members and detected events invalidate a check. Watcher
  silence is not evidence of an atomic workspace snapshot. The editor's public
  [WorkspaceEdit contract](https://code.visualstudio.com/api/references/vscode-api#workspace.applyEdit)
  provides all-or-nothing application for text-only edits, not a transaction over
  discovery, external disk processes and all editor buffers. See ADR 0014.
- Range representability and unknown-identity protection are coordinated with
  the separate match-identity change and must be integrated without silently
  assuming an unknown identity can be reconstructed from a matching offset.
- Publish a random opaque action token for an independently deep-frozen full
  model, not a copy of mutable results taken at invocation. The descriptor is
  `actionBinding: {sessionId,generation,requestFingerprint,resultRevision,
  scopeEventRevision,snapshotToken}`. It names all rows, query/effective request,
  capture and replacement semantics, including off-screen virtual rows. Stable
  selection, preview and status echoes reuse it; changed action semantics,
  template, generation and saved-search ownership cannot reuse it. The token
  attests model/action correspondence, never literal paint or reading.
- A completed partial/invalid/pending model may bind Single on a different valid
  selected row; All separately requires completeness and every row valid. A
  provided stale/malformed descriptor refuses rather than adopting latest state.
  Missing binding opens a separate frozen read-only review and requires its
  explicit action; it launches no discovery or Edit Search draft. Live source
  preview is explicitly unavailable. Retain one current manifest plus at most
  one review per source; close releases them, and closing review cancels pending
  preparation without revoking an already dispatched WorkspaceEdit.
- Record all relevant document/metadata/Save/Close/scope events, including
  zero-content and zero-match-file events while replacing. A detected initial
  enumeration race is conservatively partial without an automatic rerun.
  A completed snapshot's earlier scopeStale is resolved only by full preflight
  equality; a new event during preparation still invalidates the operation.
- Reuse the shared physical-open gate for initial Open Editors acquisition,
  validation, preview and preflight. It admits at most four underlying opens
  and 512 FIFO waiters; a caller's deadline includes FIFO time. Timeout or abort
  removes a waiter but never frees a physical slot before its host promise
  actually settles. A separate bounded lane protects complete disk preparation
  through file-handle cleanup. Exhaustion fails visibly, never bypasses a check.
- Integrate the shared UTF-16 content hash, range/identity assertion and separate
  disk baseline/source authority hooks. A known tracked dirty buffer need not
  equal its backing file. Clean disk authority and lazy observed-Save equality
  rebase are distinct from provenance proof; missing baselines, unsupported
  safe-open/encoding and unknown identity fail closed. See the implementation
  report for actual helper and integration verification, not assumptions.
- Validate every selected/fresh recorded disk baseline's origin, canonical URI,
  complete raw hash, metadata/size and explicit safe-open policy before lazy
  rebase. Missing/malformed provenance is not evidence of a changed baseline.
  Only typed baseline-change failure can enter the guarded observed-Save path;
  missing/permission/timeout/unsupported-policy failures stay refusals. Keep the
  prepared rebase operation-local until final guarded admission of a private
  current raw observation; never mutate historical rows or the approved manifest.
- Compare the full live model at admission and immediately before dispatch.
  Intermediate awaits check exact binding, generation/effective request,
  revisions, result-array identity/length and operation/event epochs, avoiding
  an all-rows comparison for every per-file wait. Those backend checks are
  invalidation guards, not a substitute for the separately frozen approval.

## Candidate-1 review refinements

- Compare effective in-scope buffer authority and non-default clean disk codecs,
  not harmless clean document-cache admission; retain Open Editors membership
  and all final selected-document/raw-byte guards.
- Global Find/Replace routes away from a current frozen review. Search/schedule/
  reset never discover on a review-only model.
- Bind replacement outcome/status/error delivery to session/generation/lifetime/
  operation on both success and false/rejected responses, while retaining the
  physical submitted-operation lock until actual settlement.

## Risks / Trade-offs

- Repeated full searches add I/O, CPU and memory. Report checking and fail closed
  rather than applying partial output.
- Active workspaces can repeatedly invalidate checks. Tell users to rerun or
  narrow scope; do not retry indefinitely.
- External edits can occur after verification despite checks. Do not claim global
  atomicity, and do not automatically repeat an edit of unknown outcome.

## Migration Plan

Sessions are in memory and reset on extension-host restart. Existing workspace
settings remain unchanged; rollback returns to the previous snapshot-only checks.
