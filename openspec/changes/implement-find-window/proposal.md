# Proposal

## Why

Currently, Open in Find Window moves the same search dialog into a tab: the query
fields, bottom preview, and repeated transfer button remain there. Bulk manual
editing needs a separate mode with a stable results tree and a real editor on
the right, as in the IntelliJ IDEA examples supplied by the user.

## What Changes

- A dedicated Find tab with a query summary, a root/directory/file/occurrence tree,
  and an action toolbar; no repeated Open in Find Window button.
- Deterministic sorting and retained result positions when files change;
  a missing match remains as INVALID, and rerunning refreshes the snapshot.
- The gear button returns this search's parameters to the modal; confirmation
  updates the original tab, while Esc retains the previous snapshot. New Tab
  creates an independent search.
- A real editable TextEditor on the right with match decorations, ordinary
  commands, Undo, and unsaved text. The modal retains its compact read-only preview.
- Replace in Find Window validates current ranges and does not replace INVALID results.

The scope was authorized by the user's direct request on 2026-11-04; no further
questions are required. Exact Secondary Side Bar placement is investigated
separately: the public API supports View/TreeView/WebviewView, but no native
TextEditor inside a sidebar. The selected supported adaptation is a regular
right editor group with a full editor; this is an explicit departure from the
literal requirement, not a new sidebar capability.

## Capabilities

### New Capabilities

- `find-results-window`: a dedicated search snapshot tree, return to search
  parameters, editable native preview, and range validity tracking.

### Modified Capabilities

The baseline directory currently contains only installation-check; the modal
contract remains in the current design-floating-search change. Its transfer
scenario will be aligned with the new dedicated view; the baseline will not be
synced without validation.

## Impact

SearchController, new Find Window UI resources, the range tracking model, and
the editor group adapter and decorations. No new runtime dependencies are needed.
Validation: unit tests, browser layout, real isolated desktop VS Code, and VSIX
contents. The user's working profile and the neighboring BL project remain
unchanged. macOS/Windows and a separate physical Remote client are not considered
tested on the basis of Linux runs.
