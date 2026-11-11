# ADR 0013: Stable result presentation without search-on-scroll

Status: **Accepted**

Date: 2026-11-11

## Context

Issue #3 reports unexpected search refreshes and changed result order on Windows
with WSL. Source inspection found that the modal renders a virtual list of
streaming results, and that the native Find tree rebuilds on notifications and
sorts the completed snapshot. The specific user report has not been reproduced
in this environment.

[ADR 0007](0007-find-window-and-native-editor.md) requires deterministic
completed snapshots and [ADR 0008](0008-native-find-panel.md) selects the public
native TreeView. This decision concerns presentation updates, not file-event
lifecycle, occurrence identity, or Replace All preflight.

## Decision

Continue background streaming, existing result limits, and modal virtualization;
scrolling will not start another search or fetch a page. Preserve the modal's
first visible result and relative offset across same-generation updates when the
result remains available. Explicit query changes continue to reset immediately.

For a same-generation native tree with unchanged action semantics and structure,
reuse provider objects and notify only changed presentations and ancestor counts.
Keep logical occurrence IDs distinct from native action handles. A changed
request, row action revision or backend full-snapshot binding creates a new
immutable row action and a non-reused native match handle, refreshing the existing
file parent rather than an unmapped new child. Parent-qualified file group IDs
avoid cross-root collisions; missing or duplicate occurrence IDs fail closed.
Keep a full structural refresh
when required and retain the existing deterministic completed order. The native
viewport can move when a batch changes the tree or when final sorting reorders
streamed rows. Precise native pixel or row anchoring is not guaranteed by this
decision.

Native command/context admission must not infer approval from mutable provider
state, selection, reveal, getTreeItem, or an event being fired. The pinned VS Code
context argument processor resolves a handle to the latest element, so merely
freezing the provider object while reusing its TreeItem ID is not safe. Delayed
obsolete commands are refused, including after a session switch and back.
Explicit current rows carry the backend-issued immutable full-manifest descriptor;
unknown toolbar replacement binding requires a frozen read-only review, not Edit
Search. The combined backend admits current full-manifest-bound actions and
uses the genuine frozen review for missing binding; the independent branch's
temporary blanket replacement refusal is deliberately not retained.

The modal has one guarded Rerun action for `scopeStale || needsRerun`. Showing a
banner or revalidating an existing row does not reset a compatible anchor or start
a full search. Parameter reset remains immediate.

## Alternatives

- Buffer the native panel until the complete sorted snapshot exists: preserves
  final ordering before display, but changes the existing streaming panel UX.
- Sort all candidate paths before searching: can delay first results and change
  which subset is returned before a limit or timeout; ripgrep path ordering is
  not established as equivalent to the existing comparator.
- Re-run or pause the search on scrolling: unnecessary for this issue and adds
  resource, consistency, cancellation, and replacement-safety complexity.
- Replace the native tree with a custom webview: would lose the native controls
  and icon behavior selected by ADR 0008.

## Consequences

Localized provider notifications reduce unnecessary root invalidations. The
public API refreshes a changed element and its visible children recursively,
so a changed root's aggregate status can still refresh its subtree. Stable logical
IDs support logical selection, but action-relevant native handle changes can
affect native selection/expansion and scrolling. A changed whole-manifest token
requires new match handles even when only one row changed. The measured CPU and
memory cost is explicit in the [local report](../testing/issue-3-scroll-order.md).
Chromium testing of the modal is not a native TreeView or VS Code GUI test.
Windows, WSL, and physical Remote require separate evidence.

Accepted records the chosen design, not platform acceptance. The
[combined regression report](../testing/issue-3-integrated-regressions.md) covers
the composed controller/provider/UI paths and preserves the separate native
EDH/physical-rendering and Windows/WSL/Remote boundaries.

## Sources

- [TreeView API, VS Code 1.145.0](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L12144-L12230)
- [TreeDataProvider refresh semantics, VS Code 1.145.0](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L12236-L12242)
- [Pinned JetBrains and native handle source comparison](../research/issue-3-result-presentation.md)
- [OpenSpec change](../../openspec/changes/fix-issue3-stable-order/)
