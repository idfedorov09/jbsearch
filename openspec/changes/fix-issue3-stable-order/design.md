# Design

## Context

The modal already renders a virtual window of its in-memory results, and its
scroll listener only re-renders that window. A same-generation update currently
preserves a numeric `scrollTop`, not the occurrence at that position. A new
generation or pending search input deliberately resets the modal.

Find Panel receives streaming batches in arrival order, rebuilds its native
tree on every notification, and sorts a completed result set using the existing
deterministic comparator. File edits update existing snapshot rows. See the
proposal for the reported issue and scope.

## Goals / Non-Goals

**Goals:** Preserve a compatible modal viewport anchor; avoid unnecessary root
refreshes for same-structure tree updates; preserve logical selection, status,
ordering, and streaming; bind actions immutably without assuming a paint ACK;
make the remaining native limitation explicit.

**Non-Goals:** Search-on-scroll, new pagination, changing enumeration, delaying
native streaming, altering result limits or timeout semantics, changing query
reset, or implementing the other issue #3 changes in this branch.

## Decisions

### Modal anchor

Before a same-generation update, capture the first visible result ID and its
offset within the fixed-height row. After replacing the result array, restore
that ID at the same offset when it remains present. Explicit user navigation
still scrolls the selected row into view, and pending query/mask/scope input or
a new generation still resets the list. Do not initiate a search when scrolling.

The fixed row-height contract is already shared by the virtual list and CSS.
If the anchor no longer exists, keep the ordinary clamped scroll position rather
than inventing an occurrence identity.

### Native tree refresh and immutable actions

Compare ordered logical match IDs, scope kind, grouping inputs and cached
primitive presentations. A generation or structural change rebuilds the tree.
File group IDs include their parent identity, so one URI under distinct roots
does not collide. Missing/duplicate logical occurrence IDs produce a diagnostic
and an empty, non-actionable tree; another root refresh is not a collision fix.

Within the same structure, status-only updates retain provider objects and
native match IDs, updating changed presentations and ancestor counts. A
session-only update emits no tree-data event. Cached fields and detached frozen
ranges detect in-place input changes rather than trusting mutable input refs.

Each match model has a non-writable frozen `action` containing generation,
logical ID, row revision, a non-reused native handle, and a captured backend
`actionBinding`. The binding is the six-field full-manifest descriptor agreed
with the replacement owner: `sessionId`, `generation`, `requestFingerprint`,
`resultRevision`, `scopeEventRevision`, `snapshotToken`. Presentation copies it;
it never creates a token or treats selection as approval. A changed request,
row action key, or non-null full binding replaces the match model and its native
handle. Refresh its existing file parent, since a newly allocated child is not
in the extension-host object map. Logical IDs/order/selection remain separate.
Switching away and back renews handles; reset, removal and identical reappearance
cannot revive an old command. No stale-handle history is retained.

The native context-menu argument processor resolves a client handle to its
**current** element. Therefore keeping an immutable object but reusing the old
TreeItem ID is insufficient: before an asynchronous repaint, an old client
handle can resolve to a newer action. `getTreeItem` never rebinds an obsolete
element, and native commands/context actions check their captured model before
and after waits. Expired context arguments do not fall back to the latest
selection. See the pinned [source comparison](../../../docs/research/issue-3-result-presentation.md).

An explicit current row can forward its immutable full binding; toolbar/keyboard
replacement without a snapshot argument forwards no binding and requires the
replacement owner's frozen review. It MUST NOT borrow the current provider's
token. The combined staging backend admits bound actions through actual
manifest/identity/source guards and missing binding through a genuine frozen
review. The independent checkout's temporary blanket refusal is deliberately
not selected; provider state alone still cannot authorize an edit.

This reduces avoidable root invalidations, not all workbench repainting. The
public `TreeDataProvider` event refreshes an element and its shown children
recursively, so a changed ancestor count can still refresh a large subtree.
[VS Code 1.145.0 API](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L12236-L12242)
documents that behavior.
The [extension-host implementation](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vs/workbench/api/common/extHostTreeViews.ts#L820-L827)
looks up event elements in its element-to-node map.

A new full-manifest token necessarily changes every row action that carries it,
even if only one file changed. Status-only reuse cannot weaken that binding.
The 50,000-row benchmark measures that whole-manifest path separately from a
single-row primitive revision and from structural rebuilds; see the testing
report. Native selection/expansion and viewport may change when handles change;
logical selection is not a claim that old pixels are still painted.

### Shared modal staleness presentation

One `#rerunSearch` handles `scopeStale || needsRerun`, guarded by pending patches,
search/replacement busy state and a duplicate-click latch until reset. It sends
an explicit generation-bound refresh. Pending search parameter changes hide
both stale flags and old rows immediately. Same-generation notice/banner and
pending/INVALID/revision updates use the same anchor path as streaming updates.
Valid Single replacement remains available beside an invalid or pending other
row; All requires a complete valid set. Accessible active-descendant and strict
preview/query tickets are composed from the query-refresh continuation;
[combined tests](../../../docs/testing/issue-3-integrated-regressions.md) separately
cover them with anchors, identity and actual backend approval. Native painting
and cross-platform execution remain independent acceptance gates.

### Streaming versus final deterministic order

Keep the current background producer, streaming native panel, limits, and final
sort. For arrival `z,a`, the completed snapshot can be `a,z`; this required sort
can move a row. The public
[TreeView API](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L12144-L12230)
does not expose the first visible item or pixel offset, so exact viewport
anchoring cannot be promised. Buffering the native panel until completion would
change its streaming UX; pre-enumerating and sorting candidates would change
latency and potentially the limited subset and timeout behavior. Neither is part
of this decision. See [ADR 0013](../../../docs/adr/0013-stable-result-presentation.md).

### Isolated enumeration measurements

On 2026-11-11, a disposable Linux temporary directory with 4,000 small text
files in 40 directories was enumerated three times per alternative with the
bundled ripgrep 15.0.0 and Node 22.23.2. Median elapsed times were:

| Alternative | First stdout data | Enumeration complete | Candidates ready after URI-key sort |
| --- | ---: | ---: | ---: |
| Current unsorted `rg --files` | 5.44 ms | 9.43 ms | Not applicable |
| `rg --sort=path` | 4.06 ms | 11.15 ms | Not applicable |
| Collect all candidates, then build URI keys and sort | 5.16 ms | 10.64 ms | 24.83 ms |

These are enumeration-only timings on one small, warm-cache fixture, not a
benchmark of first matching result, complete searches, Windows, or WSL. The
current comparator also includes root names, offsets, and tie-breakers; this
measurement of URI-key sorting is not a substitute implementation. The bundled
binary's own help says its path sort traverses sorted directory entries and
uses a single thread, which is not proof of equivalence to the existing result
comparator. An in-memory worker experiment also returned arrivals `z,a,m` and
completed order `a,m,z`, confirming the final-sort distinction. No producer or
limit change follows from these small measurements.

## Risks / Trade-offs

- A native structural update or final sort can still move the viewport; report
  and test it as a limitation rather than claiming a complete fix.
- A refresh of an ancestor with changed aggregate counts can recursively refresh
  its visible descendants; this is required to preserve native status labels.
- A changed or absent modal anchor cannot be reconstructed reliably from a
  numeric position; use ordinary scroll clamping in that case.
- Tree diffs must consider grouping, ordering, labels, status, and action
  semantics; uncertainty never authorizes rebinding a stale action.
- File events, identity and preflight are composed in a single staging checkout;
  its joint verification is separate from this change's historical local report
  and does not establish native viewport or platform acceptance.

## Migration Plan

No persisted data or configuration migration is required. Reverting this change
restores the prior rendering and refresh behavior; it does not modify searches
or files on disk.
