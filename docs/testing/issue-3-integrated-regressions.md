# Issue #3: controlled integration regression and acceptance record

Date: **2026-11-11**. Combined staging worktree: `issue-3-query-refresh`;
branch: `feature/issue-3-query-refresh`; unchanged HEAD/base:
`c326bfe72d0fbc6d17b321cb4cd78e55854d6e4c` (`0.3.2`).
**This is combined automated evidence, not release, physical native painting,
Windows/WSL/Remote or completed independent-review acceptance.**

## Current checkpoint: candidate-3 rollback repair (2026-11-12)

All three designated candidate-2 source reviews completed. A5 passed its scope;
A2-C2-R1 and A3-C2-R1 independently identified the same remaining source-event
gap after admitted modal close and during rollback reopening. Only the existing
combined writer resumed for that focused repair; immutable candidates and peer
checkouts were not changed. The source now keeps independent event/validation
coverage through actual reopening, with lifetime-bound one-shot resource
admission and fail-closed cleanup if no panel returns. See
[the new regression and fresh-check record](issue-3-candidate3-rollback-repair.md).
Candidate-3 still requires exact-manifest independent re-review and separately
authorized native/platform gates. No application launch approval is implied.

## Historical candidate-2 review repair status

Candidate-1 was independently reviewed against its immutable source/runtime
manifest and rejected for nine P2 lifecycle, authority, resource and action-route
gaps. Its historical 652-test/browser/package evidence remains below; it is not
silently reused as repaired acceptance. The designated writer repaired all nine
on the existing staging branch without changing candidate-1 or peer checkouts.
See [the repair matrix and fresh evidence](issue-3-candidate2-review-repairs.md).
Independent re-review and separately authorized native/platform gates remain open.

The preceding paragraph records candidate-2's handoff state; its later review
outcome and the focused successor are described above, without relabelling its
757-test evidence as candidate-3 verification.

## Provenance and selected implementation

One writer combined the five already-frozen local snapshots in the existing
query-refresh checkout. Before imports, the target's tracked and nonignored
untracked files, index hash, status and diff were backed up outside Git; source
manifests were verified. Peer source checkouts stayed read-only. Overlapping
controller, modal and test changes were resolved by behavior, not a wholesale
controller/branch replacement. No commit, push, index manipulation, history
merge, branch switch, version bump, baseline spec sync/archive, extension installation or
publication is part of this checkpoint.

- Query/mask/scope/options clear rows, selection, preview and accessibility state
  immediately, including before optimistic-patch ACK. Replacement-only input
  retains them but requires the newly acknowledged replacement binding.
- One event route covers document edits, metadata-only changes, Save, Close,
  watcher events, tab membership, scope policy and workspace roots. Relevant
  zero-match files count even during replacing. An initial race is conservatively
  partial/unverified, not proof of a lost match; a completed snapshot instead
  becomes `scopeStale`. No ordinary event silently runs a new full search.
- Known UTF-16 deltas retain occurrence identity and snapshot order; full-context
  worker validation refreshes regex captures. External/unknown history,
  destruction, collisions and touched ambiguous zero-width anchors fail closed.
  An equal offset/text alone cannot revive an unknown occurrence. Exact inverse
  known Undo/Redo is distinct from guessing identity from a content hash.
- Clean filesystem editors, including zero-match Open Editors, use disk search
  authority without reading their cached clean text. Dirty/untitled text is
  bounded before copying. Dirty file text and its independent raw disk baseline
  are never silently equated. Observed Save permits only guarded lazy lossless
  state-equality rebase of a verified changed baseline; the original approval
  baseline stays immutable. Unsupported safe-open/codec, permission, missing-path
  and resource errors do not become Save evidence.
- A single controller document gate covers initial preparation, validation,
  preview/navigation and preflight. A separate FS gate retains complete disk
  jobs through descriptor cleanup. Each lane has four physical leases and 512
  FIFO waiters; caller timeout/cancel does not release unresolved physical work.
  Controller validation additionally has four logical callers and 512 total
  entries, counting debounce/FIFO/running and canceled-running work until logical
  settlement. These are **not** hard physically-exited-worker/I/O bounds.
- Modal same-generation updates retain first-visible-ID/relative-offset anchors;
  scrolling never searches. Native status updates localize notifications when
  action semantics and structure are unchanged. Stable occurrence IDs are
  separate from non-reused native action handles. Whole-model token changes can
  renew every row handle and affect native selection/scroll.
- Replace actions bind a separate immutable **full backend model**, not virtual
  visible rows or the latest mutable provider state. Current reliable bindings
  need no extra popup; stale supplied bindings refuse. Missing binding opens a
  genuine frozen read-only review, not Edit Search or a discovering draft. Review
  cannot change the search/plan or adopt live preview; its action returns the
  original source binding.
- Replace All privately performs a new **complete full-scope** search. Only equal
  approved URI/range/text/captures/replacement meaning and final EOL-normalized
  plans can dispatch. New/missing/changed/ambiguous/incomplete targets preserve
  the old list and dispatch zero edits. Earlier completed staleness can be
  resolved by equality; partial/INVALID/pending/identity/binding guards remain.
  Every observed event during async preparation conflicts. Search and cumulative
  preparation deadlines are separate. Once WorkspaceEdit is submitted, its lock
  remains until the real response; failed/late apply is not called zero changes.

### Deliberate merge decisions

The shared UTF-16, snapshot, range, disk/authority and physical-gate helpers use
the final common peer APIs. The selected worker retains the final codec/BOM,
clean/dirty authority, nested-root and complete-enumeration changes. The native
provider is the final shared A4/A5 implementation. The A4 standalone temporary
blanket refusal of native replacement is **not** retained: actual backend
approval/source admission and exceptional review now provide that boundary.

Four superseded tests were removed deliberately, rather than changing production
to satisfy obsolete policy: auto-restart during initial enumeration/configuration,
blanket completed-scope refusal before preflight, and an absent-approval-backend
native refusal. Their approved no-rerun/complete-preflight/frozen-review behaviors
are covered by retained joint tests. Three policy-renamed regressions preserve
their original positive/negative paths. A declaration audit included nested
loops and restored the seven separate late-modal and stale-flag-reset cases
that a top-level-only union would miss. Distinct peer regressions remain; shared
fixtures now provide actual model tokens, lifecycle listeners and complete worker
statistics. Buffer-only synthetic fixtures explicitly use `buffer-validation` and
an injected disk adapter; real disk authority is tested separately, not disabled
in production for those mocks.

### Integration-specific repairs

1. **Pending ownership handoff:** confirm and Keep as new re-admit only pending
   URI checks with the original `{firstQueued, deadline}`, fresh destination
   generation and new action/source authority. Unknown/expired tickets become
   explained non-pending INVALID. Source late opens/workers cannot revive the
   destination. Same-owner transfer keeps its checks.
2. **Close before native show:** close aborts preview/navigation acquisition even
   before document-version binding. The native adapter checks `isClosed` and its
   immutable current hook immediately before `showTextDocument`, as well as after
   waits. Later explicit fresh INVALID inspection still works. This does not
   recall a host show already dispatched.
3. **Original deadlines:** hot requeues retain the original absolute deadline,
   including after timeout setting changes; configuration applies to fresh
   admissions only. Canceled-running validation remains globally accounted.
4. **Cache and preview transitions:** controller lifecycle transitions replace
   result arrays, including same-length replacements, so the authority helper
   cannot retain obsolete row objects. Pending admission without a content delta
   changes row revision, suppressing an old same-ID verified preview/failure.
   Initial invalidation, failure and backlog rejection use revision-changing
   shared invalidation helpers. Repeated pending echoes need not mint a revision.
5. **Late dispatched reply:** an already-submitted old-generation edit retains
   its lock, but its eventual success cannot schedule old-query validation or
   overwrite a newer generation's status. Candidate-2 extends this boundary to
   false/rejected outcomes and the actual modal/native error adapters.

## Joint regression / acceptance matrix

The J1–J11 plan originated with the query-reset owner. The following is its
**combined** execution map; a component-local report is not substituted for it.
“Node” includes explicit synthetic host observations, not VS Code UI evidence.

| ID | Acceptance exercised on the combined runtime | Evidence and boundary |
| --- | --- | --- |
| J1 | Immediate optimistic query/empty/mask/scope/regex reset; fast ACKs; invalid current regex and nonempty zero results; replacement-only retention and ACK | `query-reset-controller`, `query-reset-webview`, `ui` and real Chromium query-reset/approval harnesses; synthetic bridge |
| J2 | Old batch/completion/error/open/render rejection, same-ID generation/revision/request delivery, A→B→A keyboard selection, reset/Rerun and pending-admission late preview | Controlled production-controller promises and VM controller→webview roundtrip; real search engine for query errors; Chromium positive/current and negative/obsolete delivery |
| J3 | Same-generation anchor through streaming/status/INVALID/validation, selection and virtualized ARIA; intentional new-generation/reset scroll; no search-on-scroll | `ui`, `find-tree`, `find-presentation`; Chromium viewport/assertions. Native provider protocol only, not physical native viewport |
| J4 | Relevant/unrelated events; Save/Close/zero-content/zero-match during enumeration and replacing; bounded journal/overflow; initial partial distinct from completed stale; exactly one busy/duplicate-click guarded Rerun | `controller-find-window` actual event handlers with synthetic event sources, `ui`; Chromium stable-snapshot/Rerun. Watcher delivery itself is not proven complete |
| J5 | Continuous deltas, full regex context/captures, duplicate/colliding/destroyed/zero-width anchors, exact Undo/Redo; CRLF and surrogate-interior refusal; Close before version binding | `find-results`, `replace-safety`, `search`, `controller-find-window`, `find-preview`, real tempfile/worker `rooted-scopes` and `controller-source-authority` |
| J6 | Observed Save/autosave-style save event and atomic inode replacement; lazy state equality; independent dirty baseline; stale clean zero-match editor; encoding and typed errors; no unknown revival; same-length authority-cache transitions | Real filesystem/worker/controller authority and rooted-scope tests plus helper codec/safe-open/race tests. These Save events are supplied through the real unified controller route, not a real VS Code autosave timer |
| J7 | Entire 50,000-row grouping and 150-row virtualized model binding; fresh unchanged/added/removed/changed/capture/plan comparisons; masks/ignores/root policies, unknown eligibility, killed enumerator, partial/error/timeout | Real worker/tempfile scope tests and synthetic complete statistics/timing tests separately identified. The 50,000-row grouping fixture deliberately injects complete output; real discovery at the cap remains incomplete |
| J8 | Current and stale full binding, malformed/wrong-session tokens, retained old native commands/context, A→B→A sessions and explicit undefined context; missing-binding frozen review; source/reset/Rerun/close invalidation; no live review preview | Actual backend + provider/controller tests and Chromium frozen-review/ACK checks. Context arguments/delivery are injected, **not** proof of real frontend handle conversion or painting |
| J9 | Valid Single remains usable beside another INVALID/pending file and an overall partial snapshot; selected unusable/stale identity refuses; All stays strict | Actual replacement admission and native provider/controller tests; UI state/approval tests; no blanket compatibility guard |
| J10 | Detected events/reset/cancel/deadlines before dispatch; before/after-dispatch lock; late physical open/FS settlement and cleanup; FIFO fairness/backlog; transfer confirm/new/same-owner × debounce/FIFO/open/worker; original deadlines after setting increase/decrease | Shared physical gate and FS job tests; production controller with controlled host promises; real FS async metadata/descriptor cleanup. No hard physical worker-exit, cancellable host-show or eventual progress promise |
| J11 | Clean dependency install, syntax, entire suite, strict specs, packaging, whitespace; all four isolated Chromium harnesses; exact manifests/index/source preservation | Command table below. Independent read-only review and separately authorized EDH are still acceptance gates, not inferred from automation |

## Candidate-1 automated commands (historical; review requested repairs)

Node **22.23.2**, npm **12.0.2**, Linux x86-64. No dependency/version changes were
needed. `npm ci` completed: 234 packages installed/audited235, three moderate
reported dependency findings and the existing blocked `@vscode/vsce-sign` install
script. No audit fix, script approval, signing or publication was attempted.

These commands really ran on candidate-1, before independent reviewers found
nine P2 gaps. They are not acceptance of the repaired candidate-2:

| Command | Combined result | External evidence artifact |
| --- | --- | --- |
| `npm ci` | Passed | `integration-npm-ci.log` |
| `npm run check` | Passed | `integration-final-check.log` |
| `npm test` | **652 passed; 0 failed/skipped/canceled** | `integration-final-test.log` |
| `npm run spec:check` | **33 passed; 0 failed** | `integration-final-spec-check.log` |
| `npm run package` | Verified 90 main entries and 31-entry bundled client | `integration-final-package.log` |
| `git diff --check` plus changed/new text checks | Passed | `integration-final-diff-check.log` |
| All four isolated Chromium harnesses | Passed: query-reset12, approval4, shared Rerun and viewport assertions | `integration-final-browser-*.log`, `integration-final-browser-exits.txt` |

Earlier integration runs are retained as failure/fix history, not presented as
passes: the initial shared-fixture/protocol union exposed obsolete auto-rerun and
missing helper/token/statistics fixtures; these were corrected without weakening
production. A later full run passed 642 tests before the final pending-preview
and old-generation-dispatch regressions were added. The stable final full run,
not that intermediate count or a peer's local count, describes candidate-1 above.

### Reproducible isolated Chromium commands

Use existing external Playwright Core and Chromium paths; no repository browser
dependency is added:

```sh
JBSEARCH_PLAYWRIGHT_CORE=/path/to/playwright-core \
JBSEARCH_CHROMIUM=/path/to/chromium node test/query-reset-browser.js
PLAYWRIGHT_CORE=/path/to/playwright-core \
CHROMIUM_PATH=/path/to/chromium node scripts/check-stable-snapshot-browser.js
PLAYWRIGHT_CORE=/path/to/playwright-core \
CHROMIUM_PATH=/path/to/chromium node scripts/check-replace-approval-browser.js
JBSEARCH_PLAYWRIGHT_CORE=/path/to/playwright-core \
JBSEARCH_CHROMIUM=/path/to/chromium node test/browser/modal-viewport.js
```

The executed harnesses use Chromium **141.0.7390.37** and Playwright Core
**1.56.1**, disposable HOME/XDG/browser profiles and localhost-only synthetic
fixtures with production HTML/CSS/JS. The mock VS Code messaging boundary is
explicit. Headless Chromium uses `--no-sandbox`; disposable profiles are not an OS
sandbox. All profiles are removed by their harnesses. No VS Code executable was
launched/probed, no normal user profile was read or reused, and Chromium is not
VS Code EDH/native/Windows/WSL/physical Remote evidence.

## Independent review, native and platform gates

The combined source/runtime checkpoint must be frozen and hash-bound before
independent read-only reviewers or a separately authorized EDH runner inspect it.
A prepared external isolation plan uses a clean environment, absolute executable,
new HOME/XDG/TMP/data/extensions/runtime and synthetic fixture, `--new-window`,
`--force-disable-user-env`, no portable-mode override and normal sandbox only.
Preparation is not launch approval. An application/profile conflict or sandbox
failure is a blocker, not permission for `--no-sandbox`, an ordinary-profile
fallback or terminating unrelated instances.

Remaining acceptance steps:

- Read-only cross-review of the exact combined manifest; resolve concrete findings
  with the single writer and repeat relevant/final checks after any runtime fix.
- After explicit coordinator approval, assert actual extension activation/source,
  real native TreeView registration/commands/navigation, real Save/Close/Undo,
  immutable current/stale commands, no-dispatch observations, bound All and frozen
  review through the external EDH harness. Programmatic native API calls still
  do not establish physical clicks, handle delivery or paint/read ACK.
- Separately exercise physical modal focus/keyboard/scroll, delayed native display,
  Windows/WSL and physical Remote SSH. Existing historical Linux/macOS reports do
  not verify this combined build or those platforms.

A watcher is not a transactional journal; final-document and disk checks do not
supply atomic workspace filesystem CAS or writer provenance. No-follow protects
the final path component, not all ancestors; strict observed-Save rebase refuses
where unsupported. Four hung physical operations can stall the relevant lane
across sessions until actual settlement. Already dispatched WorkspaceEdit and
host show/close calls cannot be recalled. Initial conservative false positives,
source size/codec/permission limits and explicit Rerun costs remain intentional.

## Pinned comparison and decision links

The comparison preserves distinct pins and paths, not an invented universal
JetBrains behavior. Popup delayed clear/load-more, saved Usage View, read/write
scanner retries, smart markers and replacement actions are different mechanisms.
The user's immediate-clear/stable-snapshot/full-approved-set choices win where
literal imitation would conflict. Inspecting sources is not a JetBrains GUI test.

- [Immediate-clear popup comparison and original J1–J11 plan](query-reset-regression.md)
- [File-event and initial-enumeration primary sources](../research/issue-3-file-event-snapshot-sources.md)
- [Occurrence, document/Save and authority primary sources](../research/issue-3-occurrence-authority.md)
- [Popup/saved-view ordering and native handle source comparison](../research/issue-3-result-presentation.md)
- [Full action/approval and replacement primary sources](issue3-action-binding-research.md)
- [ADR 0011](../adr/0011-stable-search-snapshots.md), [ADR 0012](../adr/0012-tracked-occurrence-identity.md), [ADR 0013](../adr/0013-stable-result-presentation.md), [ADR 0014](../adr/0014-replace-all-preflight.md)

## Dev integration follow-up (November 12, 2026)

All three final scoped candidate-3 source reviews passed. The complete source
was transferred to `dev` with all 388 source hashes matching, followed by fresh
check, 837 Node tests, 33 strict specifications, packaging and all four isolated
Chromium harnesses. See [the dev/beta validation record](issue-3-dev-beta-validation.md)
for exact checks and the separate external-adapter/application/platform gates.
Historical candidate counts above remain historical, not current acceptance.
