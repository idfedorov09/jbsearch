# Issue 3: immutable replacement action research

Date: 2026-11-11. Source inspection only, not an IntelliJ/PyCharm GUI test.
The inspected public IntelliJ Community tag is `idea/253.31033.145`, resolved to
commit `33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44`. A small pinned source subset
was downloaded outside Git; no workspace source or query was uploaded.

## Popup and saved Usage View are different paths

In [`FindPopupPanel.initComponents`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L539-L580),
Replace Selected obtains actual selected `Usage` objects from the preview model,
updates Find settings and calls `replaceSingleUsage` in a command. Replace All
calls `doOK(false)`, not the selected preview rows. In
[`doOK`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L1016-L1042)
the popup clones/applies/validates the Find model, may show a multi-file
confirmation, sets `promptOnReplace`, and invokes the helper's OK action.
The popup's preview is bounded by the usages page size; its partial preview is
not an immutable approved full-set comparison. Its asynchronous callbacks reject
an obsolete progress-indicator identity in `findSettingsChanged`.

[`FindAndReplaceExecutorImpl.performFindAllOrReplaceAll`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/find/src/FindAndReplaceExecutorImpl.kt#L137-L152)
dispatches the Find model either to a remote API or the ordinary
`ReplaceInProjectManager.replaceInPath`. These alternatives are selected through
[`FindKey`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/lang-impl/src/com/intellij/find/impl/FindKey.kt),
including `find.in.files.split`, the collaboration variant, and a separate lazy
preview registry flag. This inspection does not establish their defaults or
behavior in every release, frontend, or JetBrains product.

For a saved Usage View,
[`ReplaceInProjectManager.searchAndShowUsages` and `addReplaceActions`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/lang-impl/src/com/intellij/find/replaceInProject/ReplaceInProjectManager.java#L197-L317)
construct a `ReplaceContext` that holds that Usage View and Find model. The All
action copies the view's usages, subtracts excluded usages and submits that set;
Selected copies selected usages and subtracts exclusions. Buttons and keyboard
actions belong to that view context, not a globally fetched latest unrelated
search. The `findingUsagesFinished` path can also replace automatically when the
caller requested no options prompt; that is a different action path.

[`UsageViewImpl.getUsages`, `getSelectedUsages`, and `addButtonToLowerPane`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/usageView-impl/src/com/intellij/usages/impl/UsageViewImpl.java)
connect actions to the in-process usages/tree model and register the action's
keyboard accelerator on its tree. These mechanisms are model/action binding,
not proof of physical paint, eye movement, or every row having been read.

## Range validity and platform differences

[`ReplaceInProjectManager.replaceUsage` and `getStringToReplace`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/lang-impl/src/com/intellij/find/replaceInProject/ReplaceInProjectManager.java#L392-L455)
operate under a WriteAction on document range markers and re-evaluate the Find
model against document text before replacement. `replaceUsages` performs a
cancellable progress/write operation and saves all documents; JB Search instead
retains unsaved WorkspaceEdits. The bulk path sorts usages by file/offset.
[`FindResultUsageInfo.isValid`](https://github.com/JetBrains/intellij-community/blob/33bbd1d7f16b52142ae2ec18f1bc294c1ca91c44/platform/lang-impl/src/com/intellij/find/impl/FindResultUsageInfo.java#L71-L151)
uses a document modification stamp, its segment and optional smart range anchor
to re-evaluate the search and require matching start/end offsets. Neither its
PSI smart pointers nor in-process read/write actions exist in the VS Code public
extension API. Matching text/offset after unknown history is not adopted as a
substitute for known occurrence identity.

## Adaptation chosen for JB Search

The explicit user contract wins over literal imitation: Replace All performs a
fresh COMPLETE full-scope scan and compares it with a previously approved full
immutable model; it never adopts fresh additional occurrences. The model binds
query, effective request, generation, all occurrence identities/ranges/text and
captures, replacement template/flags and their per-occurrence meaning. The
existing replacement policy normalizes newlines to each checked target
document's established EOL; document EOL and encoding are rechecked during
preparation. No document bytes, physical painting or global filesystem
transaction are attested by a token.

A random opaque `snapshotToken` and frozen `actionBinding` descriptor name the
entire model. Modal actions return the descriptor from their full received
model, independent of virtual rows. Selection/preview/status-only updates reuse
it; action-semantic changes, reset, copied sessions and replacement-template
changes cannot reuse it. Partial/invalid/pending models may still bind a Single
action on a valid selected occurrence; All separately requires a complete model
and every row valid. An event before invocation can make scopeStale; complete
fresh equality can establish unchanged targets. Every detected event during
asynchronous preparation invalidates that operation.

A reliably bound action needs no extra confirmation. A supplied stale or
malformed binding refuses with zero edits. An action lacking client binding,
such as a native toolbar command without a model argument, opens an exceptional
read-only frozen review with an explicit replacement action, not Edit Search or
a new discovery draft. Live source preview is explicitly unavailable there;
query, filters, replacement and rows cannot silently change. Review disposal
cancels pre-dispatch preparation; once applyEdit is dispatched, only its actual
response releases the lock. Retention is bounded to one live manifest plus at
most one frozen review per source session; closing the source releases both.

The native presentation change separately owns revision-bound immutable command
handles. Backend/provider revision alone is never treated as prior approval.
Its source tests are not proof that a real VS Code TreeView physically displayed
a particular model; joint integration and safe EDH verification remain separate.
