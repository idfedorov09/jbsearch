# Issue #3: pinned result-presentation and native-action comparison

Inspected on 2026-11-11. This is primary-source inspection, not an IntelliJ,
PyCharm, VS Code GUI, WSL, or Remote test. It does not establish all releases'
behavior or registry defaults.

## Pins and scope

JetBrains/intellij-community commit
`40d612f16d7f0b429a169e63e1217f64f46fd087` (2026-09-04) is a concrete inspected
revision, not a claim that it is the latest release. A small public-source subset
was downloaded outside the repository; no application/user source was uploaded.
VS Code source is pinned separately to
`a717861c07586a53d83b80d742cd3f59b20a6273` (2026-11-03), whose `package.json`
declares version `1.145.0`.

## Popup Find in Files is not the saved Usage View

In [FindPopupResultsAutoloadHandler](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/src/com/intellij/find/impl/FindPopupResultsAutoloadHandler.kt#L68-L283),
`handleIncomingRow` initially inserts by a comparator that prioritizes the first
result's file, then path, line and navigation offset. A load-more pass freezes
the existing prefix, deduplicates it independently of ordering, and sorts only
the tail. `runPass` copies the previous query for continuation and avoids forcing
the old selection into view. Its continuation restarts enumeration with a larger
cap; it is not merely displaying more rows from an already complete array.

[FindPopupPanel.installLoadMoreScrollListener](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L1326-L1343)
calls `tryLoadMore` near the bottom. The same panel's
[`getSelectedUsages`](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L1652-L1667)
reads Usage objects from selected table cells; its selected-replacement listener
[captures those objects](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L662-L697)
before executing the command and removing successful rows.
That is an in-process Swing/Usage binding, not evidence that a remote VS Code
provider element attests which client pixels were visible.

[FindPopupSearchState](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/src/com/intellij/find/impl/FindPopupSearchState.kt)
owns paging/dedup state; its
[tests](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/testSources/com/intellij/find/impl/FindPopupSearchStateTest.kt)
cover exhausted passes, continuation that adds rows, stalled continuation, and
fresh-search reset. They do not prove native viewport or replacement safety here.
[FindKey](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/lang-impl/src/com/intellij/find/impl/FindKey.kt)
separately gates split/CWM paths and lazy preview through registry entries; source
branches are not a claim about their defaults or every product installation.

The saved [UsageViewImpl](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/usageView-impl/src/com/intellij/usages/impl/UsageViewImpl.java#L1470-L1558)
incrementally appends valid usages under a read lock and updates their ancestors.
Its [Swing synchronization](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/usageView-impl/src/com/intellij/usages/impl/UsageViewImpl.java#L709-L786)
groups node changes by parent and sorts inserted children. Its
[validity refresh](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/usageView-impl/src/com/intellij/usages/impl/UsageViewImpl.java#L1668-L1782)
updates visible nodes/ancestors and defers collapsed ones. These are distinct
mechanisms from popup paging, not one universal frozen order. The
[GroupNode comparator](https://github.com/JetBrains/intellij-community/blob/40d612f16d7f0b429a169e63e1217f64f46fd087/platform/usageView-impl/src/com/intellij/usages/impl/GroupNode.java#L317-L347)
also uses in-process object identity as a final distinction, unsuitable as a
serialized cross-host action identity.

## VS Code handle-resolution boundary

[`ExtHostTreeViews._convertArgument`](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vs/workbench/api/common/extHostTreeViews.ts#L304-L316)
resolves context-menu item handles through `getExtensionElement`, whose
[`_elements.get`](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vs/workbench/api/common/extHostTreeViews.ts#L518-L520)
returns the current provider element. [`_createHandle`](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vs/workbench/api/common/extHostTreeViews.ts#L980-L984)
derives an explicit handle from TreeItem.id. Replacing an immutable object while
reusing that ID can therefore retarget an old client context argument before its
refresh is painted. [`_getHandlesToRefresh`](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vs/workbench/api/common/extHostTreeViews.ts#L820-L848)
also requires known provider object identities; an unknown new child cannot be
the refresh target. None of these operations is a client paint acknowledgement.

## Adaptation selected for JB Search

- Keep the accepted background streaming, in-memory modal virtualization and
  deterministic completed order. Do not adopt continuation searches, delayed
  query clearing, first-file prioritization, or a differently ordered frozen
  tail: those conflict with explicit user choices or the completed-order spec.
- Adapt the useful separation of search, presentation and explicit navigation:
  preserve the modal's first visible logical row and offset; avoid selecting or
  scrolling merely because a status changed; localize native node/ancestor work.
- Native logical occurrence IDs stay stable, but action-relevant revisions get
  new non-reused native handles and immutable backend descriptors. Reject stale
  commands/context rows before and after waits. Unknown toolbar approval uses
  the coordinated frozen-review backend, never mutable provider-state approval.
- A full-manifest token change may renew every native match handle; measure it
  separately rather than disguising it as a cheap single-row repaint. The public
  [TreeView API](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L12144-L12242)
  has no first-visible-row/pixel-offset API. Final sorting, structural changes,
  recursive ancestor refresh, and action handle renewal can move native scroll
  or selection; no exact pixel guarantee is made.

The backend occurrence/provenance, documents/markers, file-event lifecycle and
replacement preflight investigations belong to their coordinated changes. This
comparison does not import IntelliJ read/write actions, PSI or VFS authority into
VS Code, nor infer a complete scope from watcher silence. See
[ADR 0013](../adr/0013-stable-result-presentation.md) and the
[local verification report](../testing/issue-3-scroll-order.md).
