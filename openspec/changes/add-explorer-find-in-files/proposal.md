# Proposal

## Why

Searching a specific folder currently requires opening JB Search and selecting
Directory separately. A familiar Explorer folder context-menu entry should
launch the search already scoped to that directory.

## What Changes

- A **Find in Files…** item in the JB Search category in the context menu for a
  single filesystem folder in Explorer.
- Open the existing Find dialog with Directory selected, including multi-root
  workspace roots; preserve the query, masks, and flags.
- Remain independent of saved Find searches and their drafts: a context-menu
  launch neither changes a snapshot nor becomes an edit of that snapshot.
- Validate the command argument before changing the search; report an error
  instead of searching the entire project if the folder is unavailable or
  outside the workspace.
- Main extension version 0.2.0; commit and push to dev as requested by the user.

Confirmed scope: the user explicitly requested implementation and delivery to dev.
Multiple selection, searching outside the workspace, Replace from the menu, and
Marketplace publication are outside this change. Linux GUI validation is separate;
macOS, Windows, and physical Remote require their own acceptance checks.

## Capabilities

### New Capabilities

- `search-entry-points`: launch JB Search from Explorer with the selected folder context.

### Modified Capabilities

None: existing search and Find Panel semantics remain unchanged.

## Impact

Manifest, command registration, and modal session management; unit and GUI checks,
README, changelog, and OpenSpec. The search worker, client protocol, and
dependencies remain unchanged.
