## Purpose

Keep bulk replacement limited to the result snapshot the user selected, after
checking that the same eligible scope still has the same replacement targets.

## ADDED Requirements

### Requirement: Verify the complete scope before bulk replacement
Before Replace All the product SHALL search the same effective scope again and
compare the complete fresh occurrences and replacement semantics with the
selected result snapshot. It MUST NOT silently add new targets.

#### Scenario: The target set is unchanged
- **WHEN** the complete current scope yields exactly the approved occurrences and replacement meaning
- **THEN** Replace All proceeds without another mandatory confirmation
- **AND** the changes remain unsaved workspace edits

#### Scenario: The target set has changed
- **WHEN** a fresh search finds a new, removed, or semantically changed occurrence
- **THEN** no replacement is applied
- **AND** the product retains the shown snapshot and offers Rerun Search

### Requirement: Incomplete or cancelled checks fail closed
The product MUST NOT apply Replace All if its preflight cannot establish a
complete result for the eligible text scope.

#### Scenario: Search limit, timeout, cancellation, or unreadable input
- **WHEN** the preflight is cancelled, times out, hits its limit, or cannot check an eligible input
- **THEN** no replacement is applied and the user receives an explanation

#### Scenario: Deliberate binary exclusion
- **WHEN** an input is classified as binary under the existing text-search policy
- **THEN** it is excluded without blocking solely for that reason
- **AND** its contents are not searched or replaced

### Requirement: Reject changed replacement inputs
The product MUST reject replacement when a checked document, selected scope,
or search parameters change during preparation and the conflict is detected.

#### Scenario: Edit while document metadata is being read
- **WHEN** a target document changes between reading its text and preparing the edit
- **THEN** both Replace and Replace All stop without applying the stale range

#### Scenario: Workspace changes during preflight
- **WHEN** a relevant detected change invalidates the in-flight verification
- **THEN** no bulk edit is applied from that verification

### Requirement: Bound search and replacement preparation independently
The product SHALL use a separate cumulative preparation deadline for Replace and
Replace All, excluding the worker search, and SHALL retain a submitted edit's
lock until its outcome is known.

#### Scenario: Short worker search timeout
- **WHEN** the search timeout is shorter than a successful Single Replace preparation
- **THEN** Single Replace is governed by the preparation deadline instead

#### Scenario: Preparation times out before dispatch
- **WHEN** document or file preparation times out before submitting an edit
- **THEN** no edit is submitted by a late result
- **AND** the user can increase the preparation deadline or narrow the scope

#### Scenario: Edit already submitted
- **WHEN** a WorkspaceEdit has been submitted and its result is pending
- **THEN** a preparation timeout SHALL NOT claim the edit was cancelled or enable another replacement

### Requirement: Bind replacement to an immutable client model
Replacement actions SHALL name an immutable full model with an opaque action
binding, not infer prior approval from current backend/provider revisions.
Selection, virtual scrolling and status-only notifications MUST NOT retarget an
existing binding. Reset, a changed replacement plan, or a different saved search
MUST invalidate the old action.

#### Scenario: A reliably bound completed model
- **WHEN** the action carries the exact previously issued full-model binding
- **THEN** it proceeds to the applicable safety checks without a new mandatory confirmation
- **AND** Replace All compares every approved row, not only visible/selected rows

#### Scenario: Stale supplied action
- **WHEN** a supplied binding belongs to an older generation, set, plan or session
- **THEN** no edit is submitted and the product MUST NOT adopt current results for that action

#### Scenario: Missing client binding
- **WHEN** a native toolbar or another action has no reliable client model binding
- **THEN** a separate frozen read-only review shows the captured model and parameters
- **AND** an explicit bound replacement action is required
- **AND** the review launches no discovery, cannot change query or replacement, and does not show live source as an approved preview

#### Scenario: Single in a partially usable model
- **WHEN** the selected occurrence is valid but another file is INVALID/pending or discovery was partial
- **THEN** Single retains its selected-occurrence safety checks
- **AND** Replace All remains blocked until the full set is complete and valid

### Requirement: Bound physical preparation independently of caller waiting
A timed-out or cancelled caller MUST NOT release an unresolved underlying
physical-operation slot. Opening documents SHALL share a bounded controller-owned
FIFO gate across initial acquisition, validation, preview and replacement.

#### Scenario: Repeated hung opens
- **WHEN** successive preparation callers time out while host opens remain unresolved
- **THEN** no more than four underlying document opens may remain active
- **AND** waiting is separately bounded and no late result can dispatch a replacement

#### Scenario: Relevant event during initial enumeration
- **WHEN** a relevant document, metadata, Save, Close or scope event is observed during discovery
- **THEN** completion is conservatively incomplete/unverified without an automatic full rerun
- **AND** the UI offers explicit Rerun Search rather than claiming a match was necessarily lost

#### Scenario: Earlier completed scope event
- **WHEN** a completed snapshot is scopeStale before a bound Replace All action
- **THEN** complete fresh-scope equality may permit the unchanged targets
- **AND** INVALID, pending and partial guards still apply
- **AND** any new relevant event during preparation invalidates that operation

### Requirement: Keep disk authority independent of tracked buffer text
Single and bulk replacement SHALL verify an independent recorded disk baseline
for file-backed targets without requiring dirty-buffer text to equal disk.
Untitled targets SHALL NOT require a fabricated disk baseline. Recorded
provenance MUST have disk origin, the matching canonical URI, a complete raw-byte
hash, stable identity metadata and an explicit supported safe-open policy.

#### Scenario: Known dirty edits with unchanged backing bytes
- **WHEN** continuously tracked dirty text is valid and its independent disk baseline remains unchanged
- **THEN** replacement may proceed after the other identity, document and action checks
- **AND** the dirty text need not equal its backing bytes

#### Scenario: Guarded observed Save rebase
- **WHEN** a verified baseline has changed after an observed clean Save under the same document, request, row and event guards
- **THEN** a strict no-follow lossless state-equality check may return an operation-local baseline
- **AND** the approved model remains immutable and no writer provenance or disk CAS is claimed

#### Scenario: Historical provenance is unverified
- **WHEN** a baseline is missing, malformed, wrong-origin/URI or has an unsupported policy
- **THEN** no replacement is submitted, including after an observed Save
- **AND** missing, permission, timeout and unsupported-policy failures MUST NOT be treated as changed-baseline evidence

### Requirement: Ignore harmless cache admission without waiving effective source guards
The final scope check SHALL distinguish an unchanged clean document becoming
loaded from changed effective in-scope buffer authority. Open Editors membership,
non-default disk codecs and selected-document/raw-byte final guards MUST remain.

#### Scenario: Initially unloaded clean project targets are opened for preparation
- **WHEN** a complete unchanged multi-file project preflight opens its clean target documents
- **THEN** their harmless cache admission does not itself refuse Replace All
- **AND** newly admitted or changed dirty zero-match scope buffers still refuse before dispatch

### Requirement: Keep review and obsolete operation delivery isolated
Ordinary global Find/Replace MUST NOT schedule discovery on a frozen review, and
an obsolete submitted replacement outcome MUST NOT change a newer search's
result, status, error or feedback. Its real apply lock MUST remain until actual
settlement regardless of reset, close, false or rejected response.

#### Scenario: Global command while frozen review is opening or retained
- **WHEN** global Find or Replace is invoked with a current frozen review
- **THEN** an independent ordinary search may open while the review model/token remain frozen

#### Scenario: An earlier submitted apply fails after a new generation opens
- **WHEN** a false or rejected old apply arrives through a modal or native action adapter after reset or reopen
- **THEN** the earlier real operation releases only its own lock and cannot mark the new search erroneous or needing Rerun
- **AND** separate failure reporting does not imply zero source modifications
