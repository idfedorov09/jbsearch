# File events during Find: pinned source inspection

Date: 2026-11-11. This is source inspection, **not** an IntelliJ IDEA, PyCharm,
VS Code, or Remote GUI test. It describes only the inspected source paths at
IntelliJ Community commit `efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2`; it is
not a claim about every release, product configuration, or experimental backend.

## Popup versus saved results

- [`FindPopupPanel.initComponents` and `scheduleResultsUpdate`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L870-L899)
  connect query/mask/scope UI changes to a debounced fresh search. The document
  listeners here belong to the search/replace fields, not all workspace documents.
  No Save/create/delete-specific full-restart listener was found in this popup
  class. This limited finding is not proof about every transitive service.
- [`FindPopupResultsAutoloadHandler.runPass`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindPopupResultsAutoloadHandler.kt#L202-L265)
  copies the query model; load-more retains the earlier model and frozen prefix,
  while a fresh pass resets paging and cancels the old pass. Its `onCancel`
  can reschedule the still-current visible popup. This is not the same contract
  as never automatically rerunning a JB Search snapshot.
- [`UsageViewImpl.initInEDT`, `refreshUsages`, and `doAppendUsage`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/usageView-impl/src/com/intellij/usages/impl/UsageViewImpl.java#L585-L594)
  mark detected model changes and refresh presentation, expose an explicit
  rerun, and reject invalid usages while appending under read access. The
  [`UsageModelTracker` PSI listeners](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/usageView-impl/src/com/intellij/usages/impl/UsageModelTracker.java#L27-L75)
  are not a complete disk-event journal. JB Search deliberately keeps INVALID
  rows instead of silently dropping old occurrences.

## Initial enumeration: what the platform actually owns

- [`FindInProjectTask.findUsages`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindInProjectTask.java#L208-L291)
  runs priority files, searcher candidates, and a scope walk. These phases do not
  establish a single immutable filesystem instant for the entire result set.
- [`FindWorkQueue.process` / `processBatch`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindWorkQueue.kt#L269-L309)
  use yielding read actions. A write interruption retries the unfinished item;
  finished items do not automatically run again. `FileScanner.process` records
  already delivered usages on that item to avoid duplicates after a retry.
  Thus an edit/Save need not imply restarting the whole search.
- [`FileScanner.containsPattern`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FileScanner.kt#L199-L212)
  prefers the cached IntelliJ `Document` over disk text. The actual pattern
  enumeration in
  [`FindInProjectUtil.processUsagesInFile`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindInProjectUtil.java#L306-L365)
  obtains the platform document and scans under read access. This relies on
  IntelliJ's document/VFS/PSI authority; it does not justify trusting an arbitrary
  cached clean VS Code document as disk authority or rebasing provenance on Save.
- [`CandidateFilter.admitOnProducer`, `admitOnWorker`, `claimDirectory`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/CandidateFilter.kt#L67-L126)
  check validity, masks, exclusions and scopes at candidate admission and claim
  each file/directory once. Deletion can make a candidate invalid; creation after
  an already visited directory is not a promise of a new whole-scope pass.
  Exclusion policy uses VFS/project indexes, not ripgrep ignore-file semantics.
  Changing an ignore rule therefore cannot be translated into a fictitious
  identical cross-IDE event guarantee.

## Occurrence validity, replacement, and backend flags

[`FindResultUsageInfo.isValid`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindResultUsageInfo.java#L62-L147)
uses smart ranges, document modification stamps, and context-aware matching.
[`ReplaceInProjectManager.replaceUsage` / `getStringToReplace`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/replaceInProject/ReplaceInProjectManager.java#L421-L475)
recheck against the current document under write action before replacing.
Batch replacement also has its own save/write-action behavior. These are not
proof of full-scope equality or an atomic multi-file VS Code `WorkspaceEdit`.

[`FindAndReplaceExecutorImpl.findUsages`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/find/src/FindAndReplaceExecutorImpl.kt#L184-L218)
switches between the legacy path and a split/RPC path. The latter owns per-session
model-loading coroutines separately from streaming passes and disposes them on
supersession/close. The decision is guarded by
[`FindKey`](https://github.com/JetBrains/intellij-community/blob/efcaf76c5e464ce8f9b8d0f4762d44b20cec8dd2/platform/lang-impl/src/com/intellij/find/impl/FindKey.kt):
`find.in.files.split` / `find.in.files.split.cwm`, with another lazy-preview
flag. The legacy scanner findings must not be generalized to all flag settings.

## Final VS Code adaptation

1. Keep one generation, row IDs and order across ordinary delivered events.
   Validate only existing rows after completion; never insert newly found rows.
   Query, mask, and scope parameter edits still clear immediately.
2. A relevant delivered event during initial preparation/enumeration sets the
   conservative initial `partial` result: completeness is **unverified**, not
   proof that a match was lost. Unknown text history invalidates affected rows;
   membership/ignore/configuration uncertainty or journal overflow invalidates
   the entire in-flight snapshot, including earlier and later batches. Do not
   silently retry the whole search until it appears quiet.
3. An event after completion sets `scopeStale` and advances `scopeEventRevision`,
   but does not retroactively set initial `partial`. Save, Close, and zero-text
   notifications count even for zero-match scope files and during replacement.
   The absence of delivered events never proves scope equality.
4. Rerun is explicit. A complete fresh preflight may establish equality for a
   completed stale snapshot when integrated, but must not waive initial partial,
   INVALID, pending, identity, or approval-binding guards. Close cancels checks
   even before a row has a document-version binding. Save alone never advances
   the disk baseline; the independent identity/authority change owns guarded
   observed-Save state-equality rebasing.

### Deliberate false positives and their cost

A clean Save, metadata-only notification, a create already seen by enumeration,
or an ambiguously eligible watcher path can require Rerun even when the final
match set would be unchanged. The cost is another full scope scan, extra I/O/CPU,
a new result-generation reset, and temporary refusal of Replace All. A watcher
path can be a directory, conditional sibling exclusions can affect another
file, and ripgrep eligibility is not recomputed on every event. Treating an
ambiguous path as relevant is not evidence that the search included it.

Exact duplicates in Open Editors membership, definitely excluded/masked editors,
and unrelated boundaries do not notify the native root. The conservative rule
is preferred over hidden full reruns or silently asserting completeness from
watcher silence; no atomic filesystem snapshot or lost-match diagnosis is claimed.

### Non-cancellable physical work

The pinned
[`workspace.openTextDocument` declaration](https://github.com/microsoft/vscode/blob/a717861c07586a53d83b80d742cd3f59b20a6273/src/vscode-dts/vscode.d.ts#L14383-L14425)
has no cancellation token; a Close may occur after opening. A Promise timeout
cannot cancel that physical host operation. See the shared gate ownership,
bounded waiting/backlog, and synthetic-vs-native limits in
[the test report](../testing/issue-3-file-event-stability.md).
