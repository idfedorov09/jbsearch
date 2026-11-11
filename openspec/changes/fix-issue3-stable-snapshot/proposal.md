# Proposal

## Why

File and document events can restart an unrelated search, clear its results,
and move the user's viewport. Completed searches need a stable snapshot whose
existing occurrences can be checked without silently adding new matches.

## What Changes

- Retain a completed modal or Find Panel snapshot when filesystem or document
  events arrive; relevant existing occurrences become unverified and are
  checked without adding occurrences to the snapshot.
- Reject stale results safely when changes race with the initial search;
  changes to query, mask, or scope continue to reset that search immediately.
- Mark the snapshot potentially stale only for relevant or conservatively
  uncertain events and offer an explicit Rerun action in the modal.
- Keep session event revisions separate from initial-search completeness for
  integration with the independent Replace All preflight change.

## Capabilities

### New Capabilities

- `stable-search-snapshots`: Retain modal search results across external file
  events and allow the user to explicitly rerun a potentially stale search.

### Modified Capabilities

- `find-results-panel`: Avoid unnecessary notifications for unrelated file
  events and preserve the completed panel snapshot when relevant files change.

## Impact

The user explicitly authorized implementation. This change affects search
session lifecycle, VS Code event routing, modal presentation, and regression
tests; it adds no runtime dependencies. Match identity, result ordering and
scroll, and a full Replace All preflight are coordinated independent changes,
not claims of completed integration here. No platform behavior is inferred from
Linux browser tests; Windows/WSL and native VS Code GUI need separate evidence.
