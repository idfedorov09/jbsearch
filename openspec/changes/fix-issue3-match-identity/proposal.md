# Proposal

## Why

A result's displayed position is not sufficient evidence that it still denotes the original occurrence after document or filesystem changes. Incorrect reassociation or a range that VS Code cannot represent could cause an individual replacement to modify unintended text.

## What Changes

- Preserve existing result identity and order while tracking exact document changes and validating existing matches with the worker.
- Fail closed when an occurrence's identity cannot be reliably tracked, validation is incomplete, or an edit range cannot be represented exactly.
- Protect single replacement against changed document content, stale validation and stale user-visible result revisions.
- Reuse the identity model in the modal and native results panel with minimal contextual status, without adding newly found matches to an existing snapshot.
- Keep disk source provenance separate from current bounded buffer state; use explicit clean/dirty/untitled authority and guarded lazy state-equality rebase after an observed Save.
- Keep immediate reset when query, mask, scope, or other search parameters change. File-event routing, streaming/order, and Replace All preflight are coordinated separate changes.

## Capabilities

### New Capabilities
- `tracked-search-occurrences`: Track and validate individual search occurrences before replacement.

### Modified Capabilities
- `find-results-panel`: Preserve safe tracked occurrence identity and block unknown identity in the native panel.

## Impact

Affects the controller, shared range/validation and replacement safeguards, modal status presentation, native panel snapshots and tests. No new runtime dependency is planned. Implementation has been explicitly authorized; this proposal does not establish completed behavior. Windows, WSL, and Remote behavior require separate real-platform verification.
