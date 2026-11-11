# Proposal

## Why

Search results can change position as background results arrive or when a native
Find tree is refreshed. Issue #3 reports unsolicited refreshes and changing order
in a Windows + WSL session; that report has not been reproduced in this workspace.

## What Changes

- Keep the existing background search, modal row virtualization, and immediate
  reset on query, mask, or scope changes; scrolling MUST NOT start a search.
- Preserve the modal's visible occurrence and relative offset across compatible
  updates to the same search generation, without changing explicit navigation.
- Avoid unnecessary whole-tree refreshes for updates to existing Find Panel
  results while retaining stable result identities, selection, and aggregate
  status. Continue using the public native TreeView API.
- Retain deterministic ordering of completed Find Panel snapshots. Evaluate the
  interaction between streaming, this ordering, and visible row stability rather
  than silently changing the established behavior.
- Do not implement paging, on-demand continuation, or extra searching on scroll.
  File event lifecycle, match identity, and Replace All preflight are coordinated
  in separate changes and are not implemented by this one.
- Keep logical occurrence IDs separate from immutable native action handles.
  Action-relevant revisions MUST NOT retarget delayed native commands or context
  arguments. Unknown toolbar approval belongs to the coordinated frozen-review
  backend, not an inferred latest snapshot or an Edit Search draft.
- Present exactly one guarded modal Rerun action for `scopeStale || needsRerun`
  and retain the viewport through same-generation status/revalidation updates.

## Capabilities

### New Capabilities

- `search-result-viewport`: Stability and virtualization of the modal result list.

### Modified Capabilities

- `find-results-panel`: Localized updates to existing native-tree results while
  preserving the completed snapshot contract.

## Impact

The affected areas are the modal assets, native Find provider, a small shared
presentation/action adapter, controller hand-off points, and associated tests.
No new runtime dependency, VS Code proposed API, publication,
or version change is intended. A native pixel-precise viewport guarantee cannot
be assumed from the public TreeView API. Chromium tests cover the webview content,
not the VS Code workbench; Windows, WSL, and Remote require separate evidence.

Implementation is explicitly authorized. The compatibility of streaming native
rows, unchanged deterministic final order, and a fixed native viewport is an open
design constraint; planning does not assert that it has already been resolved.
