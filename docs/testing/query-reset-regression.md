# Modal query-reset regression checks

> Historical local-branch evidence. The later controlled composition and its
> actual check/acceptance boundaries are recorded in
> [the combined issue #3 regression report](issue-3-integrated-regressions.md).

Date: **November 11, 2026**. Local branch: `feature/issue-3-query-refresh`;
base: `c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c` (`v0.3.2`). This report concerns
the query-reset worker's existing checkout, not combined issue #3 integration.

## Scope, evidence and decision

The user chose **immediate clearing** when query, mask, scope or other
search-affecting parameters change. Old-query rows are not retained while waiting
for debounce, acknowledgement or new results. Replacement-only patches retain
rows, logical selection and preview; replacement waits for the patch ACK.

The inherited test-only milestone reported 249/249 tests, check/spec/package
success and a Chromium mock run. Those are historical evidence, not this
continuation's execution. That milestone found two gaps, now fixed locally:

- `aria-activedescendant` now exists only for an actually rendered selected
  option. Reset or virtualizing the logical selection away removes it; ordinary
  keyboard selection reveals the row and restores a valid reference.
- Preview delivery now requires exact generation, row `resultRevision`, render
  `previewRevision` and explicit `previewRequestId`. Reusing a result ID is not
  sufficient. The extra request distinguishes rapid A-to-B-to-A selection before
  ACK. The backend checks after open/render, including document version, and
  ignores obsolete failures. The frontend also rejects older generation/ticket
  state echoes. These tickets are not replacement approval tokens.

Reset clears preview name, path, note, code and code scroll. Empty/error states
and a changed selected row revision also clear the old preview. Invalid current
regex and a nonempty zero-result query cannot restore the previous selection.
The controller reset clears both `scopeStale` and `needsRerun`; their integrated
event route and single Rerun presentation belong to neighboring work.

## Current local automated checks

The following table is updated only from this continuation's commands. It does
not incorporate neighboring branches or infer editor/native-platform behavior.

| Check | Current local result |
| --- | --- |
| `npm ci` | Passed; 234 packages installed; client preparation up to date |
| `npm run check` | Passed |
| `npm test` | 272 passed; none failed, skipped or cancelled |
| `npm run spec:check` | 29 items passed; none failed |
| `npm run package` | Main VSIX (80 entries) and nested client (31 entries) verified |
| `git diff --check` and changed/untracked-file whitespace check | Passed |
| Focused controller/query-reset/webview/UI run | 70 passed; none failed, skipped or cancelled |
| Isolated Chromium production-webview harness | 12 scenarios passed |

Focused tests use controllable request, document-open and render promises; the
invalid-regex/zero-result cases also exercise the actual search engine. Coverage
includes optimistic parameter patches and ACKs, explicit controller Rerun after
fast query/mask/scope edits, late batches/completion/error, same-ID preview across
generations and row revisions, changed document versions, repeated selection,
keyboard/virtualization accessibility and stale asynchronous failures. One test
connects the production controller's snapshot/messages directly to the production
webview in the VM DOM harness, including same-ID reset and keyboard-preview
roundtrips; this remains a synthetic host, not VS Code.
A stale-row selection rejection also echoes the current model and releases the
obsolete local request ticket, so it cannot block later current-row preview.

`npm ci` reported three moderate dependency findings and the blocked
`@vscode/vsce-sign@2.1.0` postinstall. `npm audit --omit=dev --json` reported zero
runtime vulnerabilities. No dependency upgrades or script approvals were made;
signing/publication were not tested. Packaging and package verification passed.

## Real Chromium, synthetic VS Code messaging

Chromium **141.0.7390.37**, Playwright Core **1.56.1**, Node.js **22.23.2**,
Linux x64. The production HTML/CSS/JavaScript run in real headless Chromium, with
synthetic state/preview messages and `acquireVsCodeApi`. The harness creates and
removes a separate temporary HOME, XDG config/cache/data/runtime, TMPDIR and
browser profile. It uses an existing external Playwright installation, adding no
project dependency. The test-origin page and assets are fulfilled locally and
only synthetic state/preview input is supplied. `--no-sandbox` weakens process
isolation; a temporary profile is not
an OS sandbox and the process retains the current user's privileges.

```sh
JBSEARCH_PLAYWRIGHT_CORE=/path/to/playwright-core \
JBSEARCH_CHROMIUM=/path/to/chromium \
node test/query-reset-browser.js
```

The 12 asserted scenarios cover query/empty-query/mask/scope/regex optimistic
reset, rapid ACKs, replacement-only input, obsolete same-ID preview rejection
with positive current-preview delivery, invalid regex, zero results, rapid
keyboard A-to-B-to-A, and virtualization plus old-generation state after a
synthetic Rerun reset. The earlier accessibility/preview diagnostics are now
assertions. The modal Rerun button from neighboring work is **not** present in
this local browser run; its actual click/busy behavior is a joint check below.

This is not a VS Code webview host, proof of actual IPC reordering, a native
TreeView test, or evidence about Windows, WSL or Remote.

## Pinned JetBrains source comparison

Inspected `JetBrains/intellij-community` commit
[`30f88e395e97b1c24075e167ca464756760d137d`](https://github.com/JetBrains/intellij-community/commit/30f88e395e97b1c24075e167ca464756760d137d)
(commit timestamp **2026-11-11 11:27:02 UTC**), fetched from the primary GitHub
API/raw source. This is code inspection, not an IntelliJ/PyCharm GUI test or a
claim about every version/backend/feature-flag combination.

- [`FindPopupPanel.scheduleResultsUpdate(boolean)`](https://github.com/JetBrains/intellij-community/blob/30f88e395e97b1c24075e167ca464756760d137d/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L1294-L1300)
  updates controls and schedules the loader after 100 ms; it does not immediately
  clear the results table.
- [`FindPopupResultsAutoloadHandler.runPass` / `handleIncomingRow` / `searchStoppedProcessing`](https://github.com/JetBrains/intellij-community/blob/30f88e395e97b1c24075e167ca464756760d137d/platform/lang-impl/src/com/intellij/find/impl/FindPopupResultsAutoloadHandler.kt)
  resets fresh-search paging state, cancels the prior indicator, clears old rows
  on the first incoming fresh row, and checks current-indicator identity before
  queuing a no-row reset on stop. Invalid non-replacement validation calls
  `host.resetUi()` directly. Indicator identity/cancellation is checked before
  background work and again inside queued UI callbacks; `onStop` also checks its
  captured identity before applying UI state. Load-more intentionally copies the
  previous find model rather than mixing pending typed parameters into a pass.
- [`FindPopupSearchState.resetForFreshSearch` / `consumeNeedReset`](https://github.com/JetBrains/intellij-community/blob/30f88e395e97b1c24075e167ca464756760d137d/platform/lang-impl/src/com/intellij/find/impl/FindPopupSearchState.kt)
  explicitly implements the consume-on-first-row-or-stop reset. The
  [`FindPopupPanel` host's `resetUi` and selected-preview callback](https://github.com/JetBrains/intellij-community/blob/30f88e395e97b1c24075e167ca464756760d137d/platform/lang-impl/src/com/intellij/find/impl/FindPopupPanel.java#L1874-L1914)
  clear table/selection and hide preview, and schedule preview only for a
  currently selected usage adapter. This is not a cross-process VS Code message
  ticket protocol.
- [`FindKey`](https://github.com/JetBrains/intellij-community/blob/30f88e395e97b1c24075e167ca464756760d137d/platform/lang-impl/src/com/intellij/find/impl/FindKey.kt)
  distinguishes `find.in.files.split`, its CWM variant and lazy-preview flag.
  The inspected handler has flag-dependent finish paths; no default/rollout or
  all-backend guarantee was inferred.

**Adaptation:** adopt explicit request identity and cancellation checks, including
checks after async/UI boundaries, but intentionally do **not** adopt delayed
old-row retention. The approved immediate-clear decision wins. Saved Usage View,
replacement action binding, document-marker tracking and source authority are
separate concerns owned by the neighboring work, not established by this popup
inspection. IntelliJ's in-process read/write actions and PSI/markers do not exist
at the VS Code extension/webview boundary.

## Joint regression and acceptance plan — not yet executed

One integration owner must compose frozen local reports under a single writer,
then run the matrix on that exact combined checkout. A1 owns this acceptance
plan; A2 owns events/resource bounds, A3 occurrence identity/authority, A4 anchors/
native presentation and A5 snapshot/action/preflight/review. Each row below is
**Pending combined execution**, even where a component has local unit evidence.

Required acquisition seam: this standalone checkout still uses the baseline raw
`openTextDocument` inside modal preview selection. At controlled integration,
preserve A1's liveness/version/revision guards while composing A2's
`session.previewAbort` lifecycle and shared `openDocument(uri, { signal })` gate
acquisition; the same controller-wide physical gate must cover initial/open/
preflight/native-preview paths. A2's changing files were not copied early. The
physical resource cap is therefore not claimed as implemented by this local
query-reset milestone.

| ID | Combined scenario and required acceptance | Owners |
| --- | --- | --- |
| J1 | From a scrolled selected modal, rapidly edit query/mask/scope/regex then clear; no old rows/preview/aria/action binding survives before ACK. Valid input, invalid regex, empty query and nonempty zero results recover normally. Replacement-only edits preserve rows/selection/preview but refresh approval semantics. | A1, A5 |
| J2 | Interleave old batches, completion/failure, delayed physical open/render and posted same-ID preview with edits and explicit Rerun. Only current generation/request/row revision wins, including keyboard A-to-B-to-A and current positive preview delivery. Late callbacks cannot restore old state. | A1, A2, A3 |
| J3 | Same-generation streaming/validation preserves the modal top-ID/pixel anchor, row order and logical selection; virtualization never leaves dangling aria. Query reset/Rerun intentionally resets scroll, without auto-revealing selection on ordinary refresh. Native changed-file refresh retains stable structure/selection within documented API limits; no exact native pixel guarantee. | A1, A4 |
| J4 | Relevant content, zero-content, Save, Close, metadata and zero-match-file events advance the unified scope epoch, including during replacement. Initial enumeration race is conservatively incomplete/unverified; completed events mark stale without silent full rerun or insertion of new matches. Exactly one `#rerunSearch` appears for `scopeStale || needsRerun`, obeys busy guards, and reset clears both. | A2, A4, A5 |
| J5 | Known continuous deltas/Undo preserve occurrence identity and order; regex captures are revalidated in full context. Unknown/external history, close during open, destroyed/colliding/ambiguous zero-width anchors remain fail-closed. Row revision changes invalidate stale preview/action payloads. Cover CRLF and surrogate-interior range refusal. | A1, A2, A3, A5 |
| J6 | Observed Save lazy equality rebase works only under strict identity/encoding/version guards; dirty-buffer/disk equality or watcher silence does not prove provenance or full scope. Save/Close/metadata use one lifecycle route and late callbacks cannot revive rows. | A2, A3, A5 |
| J7 | Bound Replace All uses the full original immutable backend manifest, including off-screen rows. A complete new whole-scope preflight with identical URI/range/text/captures/replacement plan can dispatch; changed/new/missing/incomplete/ambiguous targets dispatch zero, retain old list and direct explicit Rerun. Ignore files, dirty buffers, masks and named-root bindings are included. | A2, A3, A4, A5 |
| J8 | Stale provided action binding refuses rather than adopting latest state; unknown binding opens genuine frozen review, not searching Edit Search. Review cannot add live targets; reset/change/close of source prevents stale review action. Normal reliably bound commands need no extra popup. Native delayed handle/toolbar/row-command paths are exercised separately; no physical-paint/read ACK is claimed. | A1, A4, A5 |
| J9 | Single Replace remains available for a valid selected row when another file has INVALID/pending rows and when the overall snapshot is partial; All remains blocked. Selected-row INVALID/pending/stale identity refuses. Confirm the final action-binding admission API before combined execution. | A3, A4, A5 |
| J10 | During preparation, query edits/Rerun obey busy guards; forced generation reset/cancel/event/deadline suppresses late dispatch. Physical opens obey the shared cap and bounded FIFO/caller wait even across repeated timeouts; capacity releases only on actual underlying settle. After WorkspaceEdit dispatch the lock remains until its actual response; failure/late response is not described as zero modifications. | A1, A2, A3, A5 |
| J11 | On final frozen combined code run `npm ci`, check, all tests, strict spec validation, package verification and whitespace checks; rerun the isolated production-webview harness. Record combined file map/patch hashes and distinguish synthetic browser checks from genuine native/platform acceptance. | Integration owner |

## Real VS Code and platform boundary

No VS Code binary was launched or probed by this continuation. No current
Extension Development Host or native TreeView test was performed. The inherited
report records that an earlier direct-binary version probe unintentionally
opened a normal VS Code profile; its state databases were opened, so that profile
cannot be claimed unchanged, and no restoration was attempted. Further launches
remain paused pending a separately reviewed isolation plan.

Before any genuine native run, propose exact isolated HOME/XDG/user-data-dir/
extensions-dir/`--new-window`/`extensionDevelopmentPath` settings to the
coordinator and prove isolation from source/CLI documentation without launching.
Use a synthetic workspace only after approval. Test modal reset/focus/keyboard,
native TreeView selection/actions/anchors, Save/Undo/Close and frozen review;
record actual environment and observed failures separately. Windows, WSL,
physical Remote SSH and macOS execution are not established by these Linux
Node/Chromium checks. Baseline spec sync, archive, publication and version changes
are not part of this task.
